import * as vscode from "vscode";
import type { GraphWebviewProvider } from "../webview/GraphWebviewProvider";
import type { SearchService, SearchResult } from "../services/SearchService";
import type { GraphService } from "../graph/GraphService";
import type { Logger } from "../services/Logger";
import { MessageType } from "../../shared/enums";

// ---------------------------------------------------------------------------
// QuickPick item
// ---------------------------------------------------------------------------

interface SymbolQuickPickItem extends vscode.QuickPickItem {
  readonly result: SearchResult;
}

function toQuickPickItem(result: SearchResult): SymbolQuickPickItem {
  return {
    label: result.displayName,
    ...(result.module ? { description: result.module } : {}),
    detail: result.file,
    result,
  };
}

// ---------------------------------------------------------------------------
// SearchCommand
// ---------------------------------------------------------------------------

/**
 * Implements the `codeAtlas.search` command.
 *
 * Opens a VS Code QuickPick with live search:
 * - `onDidChangeValue` fires on each keystroke → calls `SearchService.search()`
 *   → updates the QuickPick items in real-time.
 * - Picking an item reveals the graph panel and sends NodeDetails for the
 *   selected symbol so the detail panel opens automatically.
 */
export class SearchCommand implements vscode.Disposable {
  static readonly ID = "codeAtlas.search";

  private readonly registration: vscode.Disposable;

  constructor(
    private readonly provider: GraphWebviewProvider,
    private readonly searchService: SearchService,
    private readonly graphService: GraphService,
    private readonly logger: Logger,
  ) {
    this.registration = vscode.commands.registerCommand(
      SearchCommand.ID,
      this.execute.bind(this),
    );
  }

  dispose(): void {
    this.registration.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private execute(): void {
    this.logger.info('[SearchCommand] Executing "Search Code Atlas Symbols"');

    const quickPick = vscode.window.createQuickPick<SymbolQuickPickItem>();
    quickPick.placeholder = "Type a symbol name (prefix / for regex, e.g. /gen_server)";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    // Live search — update items on each keystroke.
    const changeListener = quickPick.onDidChangeValue((value) => {
      const results = this.searchService.search(value, 50);
      quickPick.items = results.map(toQuickPickItem);
    });

    // Selection — reveal graph panel and push node details to the webview.
    const acceptListener = quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (!selected) {
        quickPick.dispose();
        return;
      }

      const { id } = selected.result;
      this.logger.info("[SearchCommand] Symbol selected", { id, displayName: selected.result.displayName });

      quickPick.dispose();

      // Ensure the panel is open/revealed.
      this.provider.open(vscode.ViewColumn.Beside);

      // Resolve node details and push to webview.
      const node = this.graphService.getNode(id);
      if (node) {
        const incoming = this.graphService.getIncomingEdges(id);
        const outgoing = this.graphService.getOutgoingEdges(id);
        this.provider.send({
          type: MessageType.NodeDetails,
          node,
          incomingEdges: incoming,
          outgoingEdges: outgoing,
        });
      }
    });

    const hideListener = quickPick.onDidHide(() => {
      changeListener.dispose();
      acceptListener.dispose();
      hideListener.dispose();
      quickPick.dispose();
    });

    quickPick.show();
  }
}
