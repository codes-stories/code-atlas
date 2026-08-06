/**
 * Enumerates every node kind that the graph engine can represent.
 * Parsers map language-specific constructs to these canonical kinds.
 */
export enum NodeKind {
  Function = "function",
  Method = "method",
  Class = "class",
  Struct = "struct",
  Module = "module",
  Interface = "interface",
  Trait = "trait",
  Actor = "actor",
  GenServer = "gen_server",
  EtsTable = "ets_table",
  Queue = "queue",
  Topic = "topic",
  Database = "database",
  HttpEndpoint = "http_endpoint",
}

/**
 * Enumerates every edge kind that the graph engine can represent.
 * Maps to relationship types detected by language parsers.
 */
export enum EdgeKind {
  Call = "call",
  Spawn = "spawn",
  Async = "async",
  Publish = "publish",
  Subscribe = "subscribe",
  Implements = "implements",
  Imports = "imports",
  Reads = "reads",
  Writes = "writes",
  Extends = "extends",
  DependsOn = "depends_on",
  Creates = "creates",
  Consumes = "consumes",
}

/**
 * The full set of relationship types a parser can report.
 * A relationship is more granular than an edge kind and carries
 * language-specific semantics (e.g. Goroutine vs Thread vs Spawn).
 */
export enum RelationshipType {
  FunctionCall = "function_call",
  MethodCall = "method_call",
  Constructor = "constructor",
  AnonymousFunction = "anonymous_function",
  Closure = "closure",
  Lambda = "lambda",
  Spawn = "spawn",
  Thread = "thread",
  Goroutine = "goroutine",
  Channel = "channel",
  Async = "async",
  Await = "await",
  Promise = "promise",
  MessageQueue = "message_queue",
  Publish = "publish",
  Subscribe = "subscribe",
  Rpc = "rpc",
  Http = "http",
  WebSocket = "websocket",
  DatabaseQuery = "database_query",
  CacheAccess = "cache_access",
  Import = "import",
  Export = "export",
  DependencyInjection = "dependency_injection",
  Inheritance = "inheritance",
  InterfaceImplementation = "interface_implementation",
  Trait = "trait",
  ExtensionMethod = "extension_method",
  PatternMatch = "pattern_match",
  Guard = "guard",
  Macro = "macro",
}

/**
 * Condition kind attached to an edge — describes the control flow
 * context under which the relationship is activated.
 */
export enum ConditionKind {
  Case = "case",
  If = "if",
  Switch = "switch",
  Match = "match",
  Receive = "receive",
  PatternMatching = "pattern_matching",
  Guard = "guard",
  Spawn = "spawn",
  ForEach = "foreach",
  Map = "map",
  Filter = "filter",
  EventHandler = "event_handler",
  Callback = "callback",
  Middleware = "middleware",
  Unconditional = "unconditional",
}

/**
 * Graph layout algorithms available in the UI.
 */
export enum LayoutAlgorithm {
  Dagre = "dagre",
  Force = "force",
  Radial = "radial",
  Tree = "tree",
  Horizontal = "horizontal",
  Vertical = "vertical",
}

/**
 * Severity levels emitted by the diagnostic system.
 */
export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning",
  Info = "info",
  Hint = "hint",
}

/**
 * Messages sent between the VS Code extension host and the webview.
 * Every message must carry one of these discriminant values.
 */
export enum MessageType {
  // Extension → Webview
  GraphData = "graph_data",
  NodeDetails = "node_details",
  EdgeDetails = "edge_details",
  IndexProgress = "index_progress",
  IndexComplete = "index_complete",
  IndexError = "index_error",
  // Webview → Extension
  RequestSymbol = "request_symbol",
  RequestNodeDetails = "request_node_details",
  RequestEdgeDetails = "request_edge_details",
  OpenInEditor = "open_in_editor",
  Ready = "ready",
  SearchRequest = "search_request",
  // Extension → Webview (search response)
  SearchResults = "search_results",
}
