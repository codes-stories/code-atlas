import type { MessageType } from "./enums";
import type { CodeGraph, GraphNode, GraphEdge, ParseDiagnostic } from "./models";

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

interface BaseMessage<T extends MessageType> {
  readonly type: T;
}

// ---------------------------------------------------------------------------
// Extension → Webview messages
// ---------------------------------------------------------------------------

export interface GraphDataMessage extends BaseMessage<MessageType.GraphData> {
  readonly graph: CodeGraph;
  /** ID of the focal node when opened via "Show Code Atlas for Symbol". */
  readonly focalNodeId: string | null;
}

export interface NodeDetailsMessage extends BaseMessage<MessageType.NodeDetails> {
  readonly node: GraphNode;
  readonly incomingEdges: ReadonlyArray<GraphEdge>;
  readonly outgoingEdges: ReadonlyArray<GraphEdge>;
}

export interface EdgeDetailsMessage extends BaseMessage<MessageType.EdgeDetails> {
  readonly edge: GraphEdge;
  readonly sourceNode: GraphNode;
  readonly targetNode: GraphNode;
}

export interface IndexProgressMessage extends BaseMessage<MessageType.IndexProgress> {
  readonly parsed: number;
  readonly total: number;
  readonly currentFile: string;
}

export interface IndexCompleteMessage extends BaseMessage<MessageType.IndexComplete> {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly durationMs: number;
  readonly diagnostics: ReadonlyArray<ParseDiagnostic>;
}

export interface IndexErrorMessage extends BaseMessage<MessageType.IndexError> {
  readonly error: string;
}

/** Union of all messages the extension host can send to the webview. */
export type ExtensionToWebviewMessage =
  | GraphDataMessage
  | NodeDetailsMessage
  | EdgeDetailsMessage
  | IndexProgressMessage
  | IndexCompleteMessage
  | IndexErrorMessage
  | SearchResultsMessage;

// ---------------------------------------------------------------------------
// Webview → Extension messages
// ---------------------------------------------------------------------------

export interface RequestSymbolMessage extends BaseMessage<MessageType.RequestSymbol> {
  readonly symbolName: string;
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
}

export interface RequestNodeDetailsMessage extends BaseMessage<MessageType.RequestNodeDetails> {
  readonly nodeId: string;
}

export interface RequestEdgeDetailsMessage extends BaseMessage<MessageType.RequestEdgeDetails> {
  readonly edgeId: string;
}

export interface OpenInEditorMessage extends BaseMessage<MessageType.OpenInEditor> {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
}

export interface ReadyMessage extends BaseMessage<MessageType.Ready> {}

/** Union of all messages the webview can send to the extension host. */
export type WebviewToExtensionMessage =
  | RequestSymbolMessage
  | RequestNodeDetailsMessage
  | RequestEdgeDetailsMessage
  | OpenInEditorMessage
  | ReadyMessage
  | SearchRequestMessage;

/** Any message flowing in either direction. */
export type AnyMessage = ExtensionToWebviewMessage | WebviewToExtensionMessage;

// ---------------------------------------------------------------------------
// Search messages
// ---------------------------------------------------------------------------

/**
 * Inline search result shape — mirrors NodeRef from GraphIndex but kept
 * in shared so the webview can reference it without importing extension code.
 */
export interface SearchNodeRef {
  readonly id: string;
  readonly displayName: string;
  readonly language: string;
  readonly kind: string;
  readonly file: string;
  readonly module: string;
}

/** Webview → Extension: user typed a search query. */
export interface SearchRequestMessage extends BaseMessage<MessageType.SearchRequest> {
  readonly query: string;
}

/** Extension → Webview: search results in response to SearchRequest. */
export interface SearchResultsMessage extends BaseMessage<MessageType.SearchResults> {
  readonly query: string;
  readonly results: ReadonlyArray<SearchNodeRef>;
}
