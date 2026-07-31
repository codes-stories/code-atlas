import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "./services/Logger";
import { ConfigService } from "./services/ConfigService";
import { GraphWebviewProvider } from "./webview/GraphWebviewProvider";
import { ShowGraphCommand } from "./commands/ShowGraphCommand";
import { ShowGraphForSymbolCommand } from "./commands/ShowGraphForSymbolCommand";
import { RefreshIndexCommand } from "./commands/RefreshIndexCommand";
import { ClearCacheCommand } from "./commands/ClearCacheCommand";
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
 *   5. GraphWebviewProvider
 *   6. Commands
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

  const parserRegistry = new ParserRegistry();
  const erlangParser = new ErlangParser(workspaceRoot, loader, grammarDir);
  parserRegistry.register(erlangParser);

  logger.info("[main] Registered parsers", { languages: parserRegistry.languages() });

  // -------------------------------------------------------------------------
  // 4. Graph service
  // -------------------------------------------------------------------------

  const graphService = new GraphService(workspaceRoot, logger);

  // -------------------------------------------------------------------------
  // 5. Webview provider
  // -------------------------------------------------------------------------

  const provider = new GraphWebviewProvider(context.extensionUri, logger);

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

  // -------------------------------------------------------------------------
  // 6. Commands
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
      // Phase 8 will replace this with a full WorkspaceIndexer.
      logger.info("[main] RefreshIndex: workspace indexer not yet wired (Phase 8)");
      void vscode.window.showInformationMessage(
        "Code Atlas: Workspace indexing will be available in Phase 8.",
      );
    },
    logger,
  );

  const clearCacheCommand = new ClearCacheCommand(configService, logger);

  // -------------------------------------------------------------------------
  // 7. Register all disposables
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    logger,
    configService,
    configListener,
    provider,
    showGraphCommand,
    showGraphForSymbolCommand,
    refreshIndexCommand,
    clearCacheCommand,
  );

  logger.info("[main] Code Atlas activated successfully");
}

export function deactivate(): void {
  // Subscriptions registered on context are disposed by VS Code automatically.
}
