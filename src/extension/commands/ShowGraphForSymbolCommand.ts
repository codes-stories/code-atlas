import * as vscode from "vscode";
import type { GraphWebviewProvider } from "../webview/GraphWebviewProvider";
import type { Logger } from "../services/Logger";

/**
 * Symbol context resolved from the active editor at command invocation time.
 */
export interface SymbolContext {
  readonly symbolName: string;
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Callback invoked when the user requests the graph to focus on a symbol.
 * Implemented by the graph engine in Phase 4.
 */
export type FocusSymbolHandler = (context: SymbolContext) => Promise<void>;

/**
 * Implements the `codeAtlas.showGraphForSymbol` command.
 *
 * Reads the selected text (or word at cursor) from the active editor,
 * opens the graph panel, then invokes the registered FocusSymbolHandler
 * so the graph engine can centre the view on that symbol.
 */
export class ShowGraphForSymbolCommand implements vscode.Disposable {
  static readonly ID = "codeAtlas.showGraphForSymbol";

  private readonly registration: vscode.Disposable;
  private focusHandler: FocusSymbolHandler | null = null;

  constructor(
    private readonly provider: GraphWebviewProvider,
    private readonly logger: Logger,
  ) {
    this.registration = vscode.commands.registerCommand(
      ShowGraphForSymbolCommand.ID,
      this.execute.bind(this),
    );
  }

  /**
   * Registers the handler that will focus the graph on the resolved symbol.
   * Called from activate() once the graph engine is available.
   */
  onFocusSymbol(handler: FocusSymbolHandler): void {
    this.focusHandler = handler;
  }

  dispose(): void {
    this.registration.dispose();
  }

  private async execute(): Promise<void> {
    this.logger.info('[ShowGraphForSymbolCommand] Executing "Show Code Atlas for Symbol"');

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(
        "Code Atlas: No active editor. Place your cursor on a symbol first.",
      );
      return;
    }

    const { document, selection } = editor;
    const symbolName = this.resolveSymbolName(document, selection);

    if (!symbolName) {
      void vscode.window.showWarningMessage(
        "Code Atlas: Could not identify a symbol at the cursor position.",
      );
      return;
    }

    const context: SymbolContext = {
      symbolName,
      filePath: document.uri.fsPath,
      line: selection.active.line + 1,     // 1-based
      column: selection.active.character + 1,
    };

    this.logger.info("[ShowGraphForSymbolCommand] Targeting symbol", context);

    this.provider.open(vscode.ViewColumn.Beside);

    if (this.focusHandler) {
      await this.focusHandler(context);
    } else {
      // Phase 4 not yet wired — show a placeholder notification.
      void vscode.window.showInformationMessage(
        `Code Atlas: Opened graph. Symbol focus for "${symbolName}" will be available in Phase 4.`,
      );
    }
  }

  private resolveSymbolName(
    document: vscode.TextDocument,
    selection: vscode.Selection,
  ): string | null {
    if (!selection.isEmpty) {
      const text = document.getText(selection).trim();
      if (text.length > 0) return text;
    }

    const wordRange = document.getWordRangeAtPosition(selection.active);
    if (wordRange) {
      return document.getText(wordRange);
    }

    return null;
  }
}
