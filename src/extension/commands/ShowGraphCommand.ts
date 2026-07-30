import * as vscode from "vscode";
import type { GraphWebviewProvider } from "../webview/GraphWebviewProvider";
import type { Logger } from "../services/Logger";

/**
 * Implements the `codeAtlas.showGraph` command.
 *
 * Opens the Code Atlas graph panel for the current workspace. If the panel
 * is already open it is simply brought into focus.
 */
export class ShowGraphCommand implements vscode.Disposable {
  static readonly ID = "codeAtlas.showGraph";

  private readonly registration: vscode.Disposable;

  constructor(
    private readonly provider: GraphWebviewProvider,
    private readonly logger: Logger,
  ) {
    this.registration = vscode.commands.registerCommand(
      ShowGraphCommand.ID,
      this.execute.bind(this),
    );
  }

  dispose(): void {
    this.registration.dispose();
  }

  private execute(): void {
    this.logger.info('[ShowGraphCommand] Executing "Show Code Atlas"');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showWarningMessage(
        "Code Atlas: No workspace folder is open. Open a folder to build the graph.",
      );
      return;
    }

    this.provider.open(vscode.ViewColumn.Beside);
  }
}
