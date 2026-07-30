import * as vscode from "vscode";
import { MessageBus } from "../services/MessageBus";
import { buildWebviewHtml, generateNonce } from "./WebviewHtml";
import type { Logger } from "../services/Logger";
import type {
  ExtensionToWebviewMessage,
  OpenInEditorMessage,
  RequestEdgeDetailsMessage,
  RequestNodeDetailsMessage,
  RequestSymbolMessage,
} from "../../shared/messages";
import { MessageType } from "../../shared/enums";

export type OpenEditorHandler = (filePath: string, line: number, column: number) => Promise<void>;
export type RequestSymbolHandler = (msg: RequestSymbolMessage) => Promise<void>;
export type RequestNodeDetailsHandler = (msg: RequestNodeDetailsMessage) => Promise<void>;
export type RequestEdgeDetailsHandler = (msg: RequestEdgeDetailsMessage) => Promise<void>;

/**
 * Manages the Code Atlas graph WebviewPanel.
 *
 * Responsibilities:
 * - Create and reveal the panel (singleton — one panel per workspace).
 * - Rebuild HTML whenever the panel becomes visible again.
 * - Route webview→extension messages to registered handlers.
 * - Provide `send()` to push extension→webview messages.
 * - Dispose cleanly when the panel is closed.
 */
export class GraphWebviewProvider implements vscode.Disposable {
  static readonly VIEW_TYPE = "codeAtlas.graphView";
  static readonly TITLE = "Code Atlas";

  private panel: vscode.WebviewPanel | null = null;
  private bus: MessageBus | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  private onOpenEditor: OpenEditorHandler | null = null;
  private onRequestSymbol: RequestSymbolHandler | null = null;
  private onRequestNodeDetails: RequestNodeDetailsHandler | null = null;
  private onRequestEdgeDetails: RequestEdgeDetailsHandler | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Opens the graph panel (or reveals it if already open).
   * Called by showGraph and showGraphForSymbol commands.
   */
  open(column: vscode.ViewColumn = vscode.ViewColumn.Beside): void {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }
    this.createPanel(column);
  }

  /**
   * Posts a message from the extension host into the webview.
   * Silently drops the message if the panel is not open.
   */
  send(message: ExtensionToWebviewMessage): void {
    if (!this.bus) {
      this.logger.debug("[GraphWebviewProvider] send() called with no active panel, dropping", {
        type: message.type,
      });
      return;
    }
    void this.bus.send(message);
  }

  /** Returns true when the panel is open and visible. */
  get isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  /** Returns true when the panel exists (may be hidden). */
  get isOpen(): boolean {
    return this.panel !== null;
  }

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------

  onDidRequestOpenEditor(handler: OpenEditorHandler): void {
    this.onOpenEditor = handler;
  }

  onDidRequestSymbol(handler: RequestSymbolHandler): void {
    this.onRequestSymbol = handler;
  }

  onDidRequestNodeDetails(handler: RequestNodeDetailsHandler): void {
    this.onRequestNodeDetails = handler;
  }

  onDidRequestEdgeDetails(handler: RequestEdgeDetailsHandler): void {
    this.onRequestEdgeDetails = handler;
  }

  // ---------------------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.teardownPanel();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private createPanel(column: vscode.ViewColumn): void {
    this.panel = vscode.window.createWebviewPanel(
      GraphWebviewProvider.VIEW_TYPE,
      GraphWebviewProvider.TITLE,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist"),
          vscode.Uri.joinPath(this.extensionUri, "node_modules", "@vscode", "codicons"),
        ],
      },
    );

    this.mountPanel(this.panel);
  }

  private mountPanel(panel: vscode.WebviewPanel): void {
    const nonce = generateNonce();
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, nonce);

    this.bus = new MessageBus(panel.webview, this.logger);
    this.registerBusHandlers(this.bus);

    const onDispose = panel.onDidDispose(() => {
      this.logger.info("[GraphWebviewProvider] Panel disposed");
      this.teardownPanel();
    });

    const onVisibilityChange = panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        // Rebuild HTML so the nonce stays fresh on re-reveal.
        const freshNonce = generateNonce();
        panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, freshNonce);
        if (this.bus) {
          this.bus.dispose();
        }
        this.bus = new MessageBus(panel.webview, this.logger);
        this.registerBusHandlers(this.bus);
        this.logger.debug("[GraphWebviewProvider] Panel re-revealed, HTML refreshed");
      }
    });

    this.disposables.push(onDispose, onVisibilityChange);
    this.logger.info("[GraphWebviewProvider] Panel created");
  }

  private registerBusHandlers(bus: MessageBus): void {
    bus.on(MessageType.Ready, (_msg) => {
      this.logger.info("[GraphWebviewProvider] Webview ready");
    });

    bus.on(MessageType.OpenInEditor, (msg: OpenInEditorMessage) => {
      if (this.onOpenEditor) {
        void this.onOpenEditor(msg.filePath, msg.line, msg.column);
      }
    });

    bus.on(MessageType.RequestSymbol, (msg: RequestSymbolMessage) => {
      if (this.onRequestSymbol) {
        void this.onRequestSymbol(msg);
      }
    });

    bus.on(MessageType.RequestNodeDetails, (msg: RequestNodeDetailsMessage) => {
      if (this.onRequestNodeDetails) {
        void this.onRequestNodeDetails(msg);
      }
    });

    bus.on(MessageType.RequestEdgeDetails, (msg: RequestEdgeDetailsMessage) => {
      if (this.onRequestEdgeDetails) {
        void this.onRequestEdgeDetails(msg);
      }
    });
  }

  private teardownPanel(): void {
    this.bus?.dispose();
    this.bus = null;
    this.panel?.dispose();
    this.panel = null;
  }
}
