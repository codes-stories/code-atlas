import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "./services/Logger";
import { ConfigService } from "./services/ConfigService";
import { WorkspaceIndexer, IndexerCancelledError } from "./services/WorkspaceIndexer";
import { FileWatcher } from "./services/FileWatcher";
import { GraphWebviewProvider } from "./webview/GraphWebviewProvider";
import { ShowGraphCommand } from "./commands/ShowGraphCommand";
import { ShowGraphForSymbolCommand } from "./commands/ShowGraphForSymbolCommand";
import { RefreshIndexCommand } from "./commands/RefreshIndexCommand";
import { ClearCacheCommand } from "./commands/ClearCacheCommand";
import { SearchCommand } from "./commands/SearchCommand";
import { SearchService } from "./services/SearchService";
import { TreeSitterLoader } from "./parsers/TreeSitterLoader";
import { ErlangParser } from "./parsers/ErlangParser";
import { GraphService } from "./graph/GraphService";
import { ParserRegistry } from "../shared/ParserRegistry";
import { MessageType } from "../shared/enums";

/**
 * VS Code extension entry point.
 *
 * Dependency wiring order:
 *   1. Logger, ConfigService
 *   2. TreeSitterLoader — boots the WASM runtime
 *   3. ParserRegistry + ErlangParser registration
 *   4. GraphService — in-memory graph facade
 *   5. WorkspaceIndexer — full-workspace parse + cache orchestration
 *   6. FileWatcher — incremental re-parse on file save/create/delete
 *   7. GraphWebviewProvider
 *   8. Commands
 */
export function activate(context: vscode.ExtensionContext): void {
  // -------------------------------------------------------------------------
  // 1. Core services
  // -------------------------------------------------------------------------

  const configService = new ConfigService();
  const config = configService.get();

  const logger = new Logger(config.logLevel);
  logger.info("[main] Code Atlas activating…");

  const configListener = configService.onDidChange((updated) => {
    logger.setLevel(updated.logLevel);
    logger.debug("[main] Configuration updated", { logLevel: updated.logLevel });
  });

  // -------------------------------------------------------------------------
  // 2. Tree-sitter WASM runtime
  // -------------------------------------------------------------------------

  const loader = new TreeSitterLoader();
  const wasmDir = path.join(context.extensionUri.fsPath, "node_modules", "web-tree-sitter");

  // Boot the WASM runtime asynchronously — parsers will await ensureGrammarLoaded()
  // before first use, so this fire-and-forget is safe.
  loader.init(wasmDir).catch((err: unknown) => {
    logger.error("[main] Failed to initialise tree-sitter WASM runtime", err);
  });

  // -------------------------------------------------------------------------
  // 3. Parser registry
  // -------------------------------------------------------------------------

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const grammarDir = path.join(context.extensionUri.fsPath, "grammars");
  const cacheDir = config.cacheDirectory;

  const parserRegistry = new ParserRegistry();
  const erlangParser = new ErlangParser(workspaceRoot, loader, grammarDir);
  parserRegistry.register(erlangParser);

  logger.info("[main] Registered parsers", { languages: parserRegistry.languages() });

  // -------------------------------------------------------------------------
  // 4. Graph service
  // -------------------------------------------------------------------------

  const graphService = new GraphService(workspaceRoot, logger);

  // -------------------------------------------------------------------------
  // 4a. Search service
  // -------------------------------------------------------------------------

  const searchService = new SearchService(graphService, logger);

  // -------------------------------------------------------------------------
  // 5. Webview provider (created early so indexer can push messages to it)
  // -------------------------------------------------------------------------

  const provider = new GraphWebviewProvider(context.extensionUri, logger);

  /** Pushes the current graph snapshot to the webview (no-op if panel is closed). */
  function sendGraph(focalNodeId: string | null = null): void {
    const graph = graphService.getGraph();
    provider.send({ type: MessageType.GraphData, graph, focalNodeId });
  }

  // -------------------------------------------------------------------------
  // 6. Workspace indexer
  // -------------------------------------------------------------------------

  const indexer = new WorkspaceIndexer(
    workspaceRoot,
    cacheDir,
    parserRegistry,
    graphService,
    logger,
  );

  /**
   * Runs a full workspace index and reports progress + completion to the
   * webview.  Used by both the initial boot sequence and RefreshIndexCommand.
   */
  async function runIndex(force: boolean, token?: vscode.CancellationToken): Promise<void> {
    if (!workspaceRoot) {
      void vscode.window.showWarningMessage("Code Atlas: No workspace folder is open.");
      return;
    }

    try {
      const result = await indexer.index({
        force,
        ...(token ? { token } : {}),
        onProgress: (parsed, total, currentFile) => {
          provider.send({
            type: MessageType.IndexProgress,
            parsed,
            total,
            currentFile,
          });
        },
      });

      provider.send({
        type: MessageType.IndexComplete,
        nodeCount: Object.keys(result.graph.nodes).length,
        edgeCount: Object.keys(result.graph.edges).length,
        durationMs: result.durationMs,
        diagnostics: result.diagnostics,
      });

      sendGraph();
    } catch (err) {
      if (err instanceof IndexerCancelledError) {
        logger.info("[main] Indexing cancelled by user");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[main] Indexing failed", err);
      provider.send({ type: MessageType.IndexError, error: msg });
      void vscode.window.showErrorMessage(`Code Atlas: Indexing failed — ${msg}`);
    }
  }

  // Trigger an initial index when the extension activates (uses cache if available).
  void runIndex(false);

  // -------------------------------------------------------------------------
  // 7. File watcher — incremental re-parse
  // -------------------------------------------------------------------------

  const fileWatcher = new FileWatcher(
    workspaceRoot,
    parserRegistry,
    graphService,
    logger,
  );

  // Tell the watcher where the cache lives so it can invalidate it after
  // each incremental patch.
  fileWatcher.setCacheFilePath(indexer.cacheFilePath());

  fileWatcher.onFileChanged(() => {
    sendGraph();
  });

  if (config.enableIncrementalParsing) {
    fileWatcher.start();
  }

  // Re-start watcher when the setting changes
  configService.onDidChange((updated) => {
    if (updated.enableIncrementalParsing) {
      fileWatcher.start();
    } else {
      fileWatcher.dispose();
    }
  });

  // -------------------------------------------------------------------------
  // 8. Webview provider handlers
  // -------------------------------------------------------------------------

  provider.onDidRequestOpenEditor(async (filePath, line, column) => {
    logger.info("[main] Opening editor at", { filePath, line, column });
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(
          new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)),
          new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)),
        ),
        preserveFocus: false,
      });
    } catch (err) {
      logger.error("[main] Failed to open editor", err);
      void vscode.window.showErrorMessage(
        `Code Atlas: Could not open file. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  provider.onDidRequestNodeDetails(async (msg) => {
    const node = graphService.getNode(msg.nodeId);
    if (!node) return;
    const incoming = graphService.getIncomingEdges(msg.nodeId);
    const outgoing = graphService.getOutgoingEdges(msg.nodeId);
    provider.send({ type: MessageType.NodeDetails, node, incomingEdges: incoming, outgoingEdges: outgoing });
  });

  provider.onDidRequestEdgeDetails(async (msg) => {
    const edge = graphService.getEdge(msg.edgeId);
    if (!edge) return;
    const sourceNode = graphService.getNode(edge.sourceId);
    const targetNode = graphService.getNode(edge.targetId);
    if (!sourceNode || !targetNode) return;
    provider.send({ type: MessageType.EdgeDetails, edge, sourceNode, targetNode });
  });

  provider.onDidRequestSearch((msg) => {
    const results = searchService.search(msg.query);
    provider.send({ type: MessageType.SearchResults, query: msg.query, results });
  });

  // -------------------------------------------------------------------------
  // 9. Commands
  // -------------------------------------------------------------------------

  const showGraphCommand = new ShowGraphCommand(provider, logger);

  const showGraphForSymbolCommand = new ShowGraphForSymbolCommand(provider, logger);
  showGraphForSymbolCommand.onFocusSymbol(async (ctx) => {
    const parser = parserRegistry.resolve(ctx.filePath);
    if (!parser) {
      void vscode.window.showWarningMessage(
        `Code Atlas: No parser registered for ${path.extname(ctx.filePath)} files.`,
      );
      return;
    }
    const defs = await parser.getDefinitions(ctx.filePath, ctx.symbolName);
    if (defs.length === 0) {
      void vscode.window.showInformationMessage(
        `Code Atlas: No definition found for "${ctx.symbolName}".`,
      );
      return;
    }
    const graph = graphService.getGraph();
    const focalNode = defs[0]!.node;
    provider.send({ type: MessageType.GraphData, graph, focalNodeId: focalNode.id });
  });

  const refreshIndexCommand = new RefreshIndexCommand(
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Code Atlas: Re-indexing workspace…",
          cancellable: true,
        },
        async (_progress, token) => {
          await runIndex(/* force */ true, token);
        },
      );
    },
    logger,
  );

  const clearCacheCommand = new ClearCacheCommand(configService, logger);

  const searchCommand = new SearchCommand(provider, searchService, graphService, logger);

  // -------------------------------------------------------------------------
  // 10. Register all disposables
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    logger,
    configService,
    configListener,
    provider,
    fileWatcher,
    showGraphCommand,
    showGraphForSymbolCommand,
    refreshIndexCommand,
    clearCacheCommand,
    searchService,
    searchCommand,
  );

  logger.info("[main] Code Atlas activated successfully");
}

export function deactivate(): void {
  // Subscriptions registered on context are disposed by VS Code automatically.
}
