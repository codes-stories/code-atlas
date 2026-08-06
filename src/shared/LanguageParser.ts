import type { CodeGraph, GraphNode, GraphEdge, ParseDiagnostic, SourceLocation } from "./models";

// ---------------------------------------------------------------------------
// Parser input types
// ---------------------------------------------------------------------------

/**
 * Describes a single file offered to the parser for analysis.
 */
export interface ParseFileInput {
  /** Absolute path to the file on disk. */
  readonly filePath: string;

  /** UTF-8 content of the file. */
  readonly content: string;

  /**
   * Content of the file as it existed before the current edit.
   * Provided during incremental re-parses; undefined on first parse.
   */
  readonly previousContent?: string;
}

/**
 * Input describing a full workspace to be parsed from scratch.
 */
export interface ParseWorkspaceInput {
  /** Absolute path to the workspace root. */
  readonly workspaceRoot: string;

  /**
   * Explicit list of files to parse.
   * When undefined the parser uses its own file-discovery logic.
   */
  readonly files?: ReadonlyArray<string>;

  /**
   * Glob patterns relative to workspaceRoot that the parser should skip.
   * Typically populated from .gitignore and user configuration.
   */
  readonly excludePatterns: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Parser output types
// ---------------------------------------------------------------------------

/**
 * Definitions resolved by the parser for a given symbol name.
 */
export interface DefinitionResult {
  readonly node: GraphNode;
  readonly location: SourceLocation;
}

/**
 * A single reference to a symbol found by the parser.
 */
export interface ReferenceResult {
  readonly nodeId: string;
  readonly location: SourceLocation;
  readonly kind: "definition" | "reference" | "declaration";
}

/**
 * All relationships originating from or pointing at a specific node.
 */
export interface RelationshipResult {
  readonly nodeId: string;
  readonly outgoing: ReadonlyArray<GraphEdge>;
  readonly incoming: ReadonlyArray<GraphEdge>;
}

// ---------------------------------------------------------------------------
// LanguageParser interface
// ---------------------------------------------------------------------------

/**
 * Contract that every language parser plugin must implement.
 *
 * Design constraints:
 * - The graph engine imports ONLY this interface — never concrete parser types.
 * - All methods are async to support background Workers and WASM initialisation.
 * - Methods must not throw; errors are surfaced via ParseDiagnostic or returned
 *   as Error instances where the signature indicates.
 */
export interface LanguageParser {
  /**
   * Returns the canonical language identifier (e.g. "erlang", "go", "rust").
   * Used as the discriminant key in ParserRegistry.
   */
  language(): string;

  /**
   * Returns true if this parser can handle the given file path.
   * Typically checks the file extension and optionally the first few bytes
   * (shebang lines, magic bytes).
   */
  supports(filePath: string): boolean;

  /**
   * Parses the entire workspace and returns a complete CodeGraph.
   * Called on first open and after cache invalidation.
   * Must emit progress events through the provided callback if provided.
   * The optional third argument `currentFile` names the file currently
   * being processed so callers can surface it in progress notifications.
   */
  parseWorkspace(
    input: ParseWorkspaceInput,
    onProgress?: (parsed: number, total: number, currentFile?: string) => void,
  ): Promise<CodeGraph>;

  /**
   * Parses a single file in isolation and returns the partial graph
   * describing only the symbols and edges found in that file.
   * Used for incremental updates.
   */
  parseFile(input: ParseFileInput): Promise<CodeGraph>;

  /**
   * Returns all definitions matching the given symbol name within a file.
   * Used by "Go to Definition" and graph focus commands.
   */
  getDefinitions(
    filePath: string,
    symbolName: string,
  ): Promise<ReadonlyArray<DefinitionResult>>;

  /**
   * Returns all references to the given node within the workspace graph.
   */
  getReferences(
    nodeId: string,
    graph: CodeGraph,
  ): Promise<ReadonlyArray<ReferenceResult>>;

  /**
   * Returns all relationships (edges) originating from or pointing at a node.
   * The graph engine calls this when building neighbourhood views.
   */
  getRelationships(
    nodeId: string,
    graph: CodeGraph,
  ): Promise<RelationshipResult>;

  /**
   * Returns parser-level diagnostics for a file.
   * Only covers parse errors and warnings, not language diagnostics.
   */
  getDiagnostics(filePath: string): Promise<ReadonlyArray<ParseDiagnostic>>;
}
