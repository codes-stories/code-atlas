import * as vscode from "vscode";
import { Logger } from "./services/Logger";
import { ConfigService } from "./services/ConfigService";
import { GraphWebviewProvider } from "./webview/GraphWebviewProvider";
import { ShowGraphCommand } from "./commands/ShowGraphCommand";
import { ShowGraphForSymbolCommand } from "./commands/ShowGraphForSymbolCommand";
import { RefreshIndexCommand } from "./commands/RefreshIndexCommand";
import { ClearCacheCommand } from "./commands/ClearCacheCommand";

/**
 * VS Code extension entry point.
 *
 * `activate` is called once when the extension is first loaded. It is
 * responsible for constructing every service and registering all
 * disposables with the ExtensionContext so VS Code can clean up on
 * deactivation without the extension needing to track subscriptions itself.
 *
 * Dependency wiring order:
 *   1. Logger          — no dependencies
 *   2. ConfigService   — no dependencies
 *   3. Provider        — Logger, extensionUri
 *   4. Commands        — Provider, Logger, ConfigService
 *   5. Config listener — Logger, (future: graph engine)
 */
export function activate(context: vscode.ExtensionContext): void {
  // -------------------------------------------------------------------------
  // 1. Core services
  // -------------------------------------------------------------------------

  const configService = new ConfigService();
  const config = configService.get();

  const logger = new Logger(config.logLevel);
  logger.info("[main] Code Atlas activating…");

  // Keep log level in sync with user settings.
  const configListener = configService.onDidChange((updated) => {
    logger.setLevel(updated.logLevel);
    logger.debug("[main] Configuration updated", { logLevel: updated.logLevel });
  });

  // -------------------------------------------------------------------------
  // 2. Webview provider
  // -------------------------------------------------------------------------

  const provider = new GraphWebviewProvider(context.extensionUri, logger);

  // Wire up the OpenInEditor handler immediately — no dependency on the graph
  // engine, so it can be registered here.
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

  // -------------------------------------------------------------------------
  // 3. Commands
  // -------------------------------------------------------------------------

  const showGraphCommand = new ShowGraphCommand(provider, logger);

  const showGraphForSymbolCommand = new ShowGraphForSymbolCommand(provider, logger);
  // Phase 4 will call showGraphForSymbolCommand.onFocusSymbol(graphEngine.focus).

  const refreshIndexCommand = new RefreshIndexCommand(
    async () => {
      // Phase 8 will replace this stub with a real workspace indexer call.
      logger.info("[main] RefreshIndex: workspace indexer not yet wired (Phase 8)");
      void vscode.window.showInformationMessage(
        "Code Atlas: Workspace indexing will be available in Phase 8.",
      );
    },
    logger,
  );

  const clearCacheCommand = new ClearCacheCommand(configService, logger);

  // -------------------------------------------------------------------------
  // 4. Register all disposables
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

/**
 * Called by VS Code when the extension is deactivated (window close,
 * reload, or explicit disable). All disposables registered in
 * `context.subscriptions` are already cleaned up by the time this runs.
 */
export function deactivate(): void {
  // Subscriptions registered on context are disposed by VS Code automatically.
  // Nothing additional to clean up here.
}
