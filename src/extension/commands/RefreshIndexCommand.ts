import * as vscode from "vscode";
import type { Logger } from "../services/Logger";

/**
 * Callback invoked when the user requests a full workspace re-index.
 * Implemented by the workspace indexer in Phase 8.
 */
export type RefreshIndexHandler = () => Promise<void>;

/**
 * Implements the `codeAtlas.refreshIndex` command.
 *
 * Triggers a full workspace re-parse, discarding any incremental cache.
 * The actual indexing work is delegated to the handler injected at
 * registration time (provided by the workspace indexer in Phase 8).
 *
 * Until Phase 8 the handler is a no-op stub; the command is still
 * registered so VS Code does not report it as missing.
 */
export class RefreshIndexCommand implements vscode.Disposable {
  static readonly ID = "codeAtlas.refreshIndex";

  private readonly registration: vscode.Disposable;

  constructor(
    private readonly handler: RefreshIndexHandler,
    private readonly logger: Logger,
  ) {
    this.registration = vscode.commands.registerCommand(
      RefreshIndexCommand.ID,
      this.execute.bind(this),
    );
  }

  dispose(): void {
    this.registration.dispose();
  }

  private async execute(): Promise<void> {
    this.logger.info('[RefreshIndexCommand] Executing "Refresh Workspace Index"');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Atlas: Refreshing workspace index…",
        cancellable: false,
      },
      async () => {
        try {
          await this.handler();
        } catch (err) {
          this.logger.error("[RefreshIndexCommand] Re-index failed", err);
          void vscode.window.showErrorMessage(
            `Code Atlas: Failed to refresh index. ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    );
  }
}
