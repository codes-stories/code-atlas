import * as vscode from "vscode";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../../shared/messages";
import type { MessageType } from "../../shared/enums";
import type { Logger } from "./Logger";

type HandlerMap = {
  [K in WebviewToExtensionMessage["type"]]?: (
    msg: Extract<WebviewToExtensionMessage, { type: K }>,
  ) => void | Promise<void>;
};

/**
 * Typed message bus sitting between the extension host and a single webview panel.
 *
 * - `send()` posts an ExtensionToWebviewMessage into the webview.
 * - `on()` registers a handler for a specific incoming message type.
 * - `dispose()` tears down all listeners.
 *
 * One bus instance is created per GraphWebviewProvider panel and is disposed
 * when the panel is closed.
 */
export class MessageBus implements vscode.Disposable {
  private readonly handlers: HandlerMap = {};
  private readonly panelListener: vscode.Disposable;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly logger: Logger,
  ) {
    this.panelListener = this.webview.onDidReceiveMessage((raw: unknown) => {
      void this.dispatch(raw);
    });
  }

  /**
   * Sends a message from the extension host to the webview.
   * Returns the thenable from postMessage so callers can await delivery.
   */
  send(message: ExtensionToWebviewMessage): Thenable<boolean> {
    this.logger.debug("[MessageBus] → webview", { type: message.type });
    return this.webview.postMessage(message);
  }

  /**
   * Registers a handler for a specific incoming message type.
   * Calling `on()` twice for the same type replaces the previous handler.
   */
  on<K extends WebviewToExtensionMessage["type"]>(
    type: K,
    handler: (msg: Extract<WebviewToExtensionMessage, { type: K }>) => void | Promise<void>,
  ): void {
    (this.handlers as Record<string, unknown>)[type] = handler;
  }

  dispose(): void {
    this.panelListener.dispose();
  }

  private async dispatch(raw: unknown): Promise<void> {
    if (!isWebviewMessage(raw)) {
      this.logger.warn("[MessageBus] Received unrecognised message from webview", raw);
      return;
    }

    this.logger.debug("[MessageBus] ← webview", { type: raw.type });

    const handler = (this.handlers as Record<string, unknown>)[raw.type];
    if (typeof handler !== "function") {
      this.logger.debug("[MessageBus] No handler registered for", { type: raw.type });
      return;
    }

    try {
      await (handler as (msg: WebviewToExtensionMessage) => Promise<void>)(raw);
    } catch (err) {
      this.logger.error(`[MessageBus] Handler for "${raw.type}" threw`, err);
    }
  }
}

function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as Record<string, unknown>)["type"] === "string"
  );
}

/** Discriminant helper — narrows a MessageType string to a known webview→extension type. */
export function isIncomingType(type: string): type is WebviewToExtensionMessage["type"] {
  const incomingTypes: MessageType[] = [
    "request_symbol" as MessageType,
    "request_node_details" as MessageType,
    "request_edge_details" as MessageType,
    "open_in_editor" as MessageType,
    "ready" as MessageType,
  ];
  return incomingTypes.includes(type as MessageType);
}
