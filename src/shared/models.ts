import type { NodeKind, EdgeKind, RelationshipType, ConditionKind, DiagnosticSeverity } from "./enums";

// ---------------------------------------------------------------------------
// Source location
// ---------------------------------------------------------------------------

/** An exact position within a source file. */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** A range within a source file (start inclusive, end exclusive). */
export interface SourceRange {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
}

// ---------------------------------------------------------------------------
// Git metadata
// ---------------------------------------------------------------------------

export interface GitBlame {
  readonly author: string;
  readonly email: string;
  readonly date: string;
  readonly commit: string;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Complexity metrics
// ---------------------------------------------------------------------------

export interface ComplexityMetrics {
  /** McCabe cyclomatic complexity */
  readonly cyclomatic: number;
  /** Cognitive complexity */
  readonly cognitive: number;
  /** Lines of code (excluding blank lines and comments) */
  readonly loc: number;
  /** Number of parameters */
  readonly parameters: number;
}

// ---------------------------------------------------------------------------
// Graph Node
// ---------------------------------------------------------------------------

/**
 * A single node in the Code Atlas graph.
 * Every parser must map its language constructs to this canonical type.
 */
export interface GraphNode {
  /** Globally unique identifier — stable across incremental rebuilds. */
  readonly id: string;

  /** Human-readable label shown in the graph. */
  readonly displayName: string;

  /** The programming language this node originated from. */
  readonly language: string;

  /** The canonical kind of this symbol. */
  readonly kind: NodeKind;

  /**
   * Fully-qualified module/namespace/class that contains this symbol.
   * Empty string when the symbol lives at the top level.
   */
  readonly module: string;

  /** Full type or function signature, as it appears in the source. */
  readonly signature: string;

  /** Primary definition location. */
  readonly location: SourceLocation;

  /**
   * Full definition range (start of signature → end of body).
   * Used for "peek definition" and code extraction.
   */
  readonly range: SourceRange;

  /** Extracted doc comment, stripped of delimiters. */
  readonly documentation: string;

  /** Static complexity metrics computed by the parser. */
  readonly complexity: ComplexityMetrics;

  /** IDs of all edges where this node is the destination. */
  readonly incomingEdgeIds: ReadonlyArray<string>;

  /** IDs of all edges where this node is the source. */
  readonly outgoingEdgeIds: ReadonlyArray<string>;

  /** Git blame for the line on which the symbol is defined. */
  readonly gitBlame: GitBlame | null;

  /** Arbitrary parser-specific metadata. Typed per language in parser packages. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Graph Edge
// ---------------------------------------------------------------------------

/**
 * A directed relationship between two nodes.
 * The graph engine never mutates edges — they are always rebuilt from parser output.
 */
export interface GraphEdge {
  /** Globally unique identifier. */
  readonly id: string;

  /** ID of the source node (caller / depender). */
  readonly sourceId: string;

  /** ID of the destination node (callee / dependency). */
  readonly targetId: string;

  /**
   * Canonical edge kind — used for filtering and rendering decisions.
   * One RelationshipType maps to exactly one EdgeKind (see EdgeKind docs).
   */
  readonly kind: EdgeKind;

  /** Fine-grained relationship type reported by the parser. */
  readonly relationshipType: RelationshipType;

  /** Location of the call site / dependency statement in source. */
  readonly location: SourceLocation;

  /** Verbatim source snippet at the call site. */
  readonly sourceCode: string;

  /**
   * Human-readable reason the edge exists (e.g. "gen_server:call/2 invocation").
   * Populated by the parser; left empty when obvious.
   */
  readonly reason: string;

  /**
   * The control-flow condition under which this relationship is activated.
   * Unconditional when the call always happens.
   */
  readonly conditionKind: ConditionKind;

  /**
   * Verbatim condition expression when conditionKind !== Unconditional.
   * E.g. the guard or pattern-match clause.
   */
  readonly conditionExpression: string;

  /** Examples of concrete invocations / usages, extracted from the source. */
  readonly examples: ReadonlyArray<string>;

  /** Arbitrary parser-specific metadata. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Code Graph
// ---------------------------------------------------------------------------

/**
 * The complete in-memory graph for a workspace analysis.
 * Immutable after construction; incremental updates produce a new CodeGraph.
 */
export interface CodeGraph {
  /** Unique identifier for this graph snapshot. */
  readonly id: string;

  /** Wall-clock time when this snapshot was built (ISO-8601). */
  readonly builtAt: string;

  /** Workspace root URI this graph was built from. */
  readonly workspaceRoot: string;

  /** All nodes, keyed by node ID for O(1) lookup. */
  readonly nodes: Readonly<Record<string, GraphNode>>;

  /** All edges, keyed by edge ID for O(1) lookup. */
  readonly edges: Readonly<Record<string, GraphEdge>>;

  /** Languages present in this graph. */
  readonly languages: ReadonlyArray<string>;

  /** Total file count parsed. */
  readonly fileCount: number;

  /** Wall-clock parse duration in milliseconds. */
  readonly parseTimeMs: number;
}

// ---------------------------------------------------------------------------
// Parser diagnostic
// ---------------------------------------------------------------------------

/**
 * A non-fatal issue reported by a parser while analysing a file.
 * Does not prevent graph construction but is surfaced to the user.
 */
export interface ParseDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly location: SourceLocation;
  readonly language: string;
  readonly file: string;
}
