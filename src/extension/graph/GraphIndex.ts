import type { CodeGraph, GraphNode, GraphEdge } from "../../shared/models";
import type { NodeKind, EdgeKind } from "../../shared/enums";

// ---------------------------------------------------------------------------
// Index result types
// ---------------------------------------------------------------------------

/** A lightweight reference to a node suitable for list/search results. */
export interface NodeRef {
  readonly id: string;
  readonly displayName: string;
  readonly language: string;
  readonly kind: NodeKind;
  readonly file: string;
  readonly module: string;
}

// ---------------------------------------------------------------------------
// GraphIndex
// ---------------------------------------------------------------------------

/**
 * Secondary in-memory index built over an immutable {@link CodeGraph}.
 *
 * The `CodeGraph` itself provides O(1) lookup by ID (`graph.nodes[id]`).
 * `GraphIndex` adds fast lookup along four additional axes:
 *
 * | Axis      | Key              | Returns                     |
 * |-----------|------------------|-----------------------------|
 * | File      | absolute path    | all node IDs in that file   |
 * | Module    | module string    | all node IDs in that module |
 * | Kind      | NodeKind enum    | all node IDs of that kind   |
 * | Language  | language string  | all node IDs for that lang  |
 *
 * The index is **immutable after construction** — rebuilding it is cheap
 * (single O(n) pass) and keeps the design simple.
 *
 * Edge lookup helpers are also provided for the detail panel.
 */
export class GraphIndex {
  /** node id → array of edge ids where node is the source */
  private readonly outgoingIndex = new Map<string, string[]>();
  /** node id → array of edge ids where node is the target */
  private readonly incomingIndex = new Map<string, string[]>();
  /** file path → node ids */
  private readonly byFile = new Map<string, string[]>();
  /** module string → node ids */
  private readonly byModule = new Map<string, string[]>();
  /** NodeKind → node ids */
  private readonly byKind = new Map<NodeKind, string[]>();
  /** language → node ids */
  private readonly byLanguage = new Map<string, string[]>();
  /** edge kind → edge ids */
  private readonly edgesByKind = new Map<EdgeKind, string[]>();

  /**
   * Cache for {@link searchByName} results.
   * Key: `"${query}:${limit}"` — value: the sorted NodeRef array returned.
   * The cache is naturally invalidated when a new `GraphIndex` is constructed
   * (i.e. when the underlying `CodeGraph` snapshot changes).
   */
  private readonly searchCache = new Map<string, ReadonlyArray<NodeRef>>();

  private readonly graph: CodeGraph;

  constructor(graph: CodeGraph) {
    this.graph = graph;
    this.buildIndex();
  }

  // ---------------------------------------------------------------------------
  // Node lookups
  // ---------------------------------------------------------------------------

  /** All node IDs defined in the given file. */
  nodesInFile(filePath: string): ReadonlyArray<string> {
    return this.byFile.get(filePath) ?? [];
  }

  /** All node IDs belonging to the given module string. */
  nodesInModule(module: string): ReadonlyArray<string> {
    return this.byModule.get(module) ?? [];
  }

  /** All node IDs of the given kind. */
  nodesOfKind(kind: NodeKind): ReadonlyArray<string> {
    return this.byKind.get(kind) ?? [];
  }

  /** All node IDs for the given language. */
  nodesForLanguage(language: string): ReadonlyArray<string> {
    return this.byLanguage.get(language) ?? [];
  }

  /**
   * Returns lightweight {@link NodeRef} objects for all nodes matching a
   * case-insensitive substring search on `displayName`.
   * Results are sorted by displayName ascending.
   *
   * Results are memoised per `(query, limit)` pair for the lifetime of this
   * `GraphIndex` instance.  Because `GraphIndex` is rebuilt whenever the
   * underlying `CodeGraph` snapshot changes, the cache is naturally
   * invalidated — no manual invalidation is required.
   */
  searchByName(query: string, limit = 100): ReadonlyArray<NodeRef> {
    const cacheKey = `${query}:${limit}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const q = query.toLowerCase();
    const results: NodeRef[] = [];

    for (const node of Object.values(this.graph.nodes)) {
      if (results.length >= limit) break;
      if (node.displayName.toLowerCase().includes(q)) {
        results.push(nodeToRef(node));
      }
    }

    const sorted = results.sort((a, b) => a.displayName.localeCompare(b.displayName));
    this.searchCache.set(cacheKey, sorted);
    return sorted;
  }

  /**
   * Returns all files that contain at least one node.
   * Sorted alphabetically.
   */
  allFiles(): ReadonlyArray<string> {
    return [...this.byFile.keys()].sort();
  }

  /**
   * Returns all module strings present in the graph.
   * Sorted alphabetically.
   */
  allModules(): ReadonlyArray<string> {
    return [...this.byModule.keys()].sort();
  }

  /**
   * Returns all languages present in the graph.
   */
  allLanguages(): ReadonlyArray<string> {
    return this.graph.languages;
  }

  // ---------------------------------------------------------------------------
  // Edge lookups
  // ---------------------------------------------------------------------------

  /** All edges where the given node is the source (caller / depender). */
  outgoingEdges(nodeId: string): ReadonlyArray<GraphEdge> {
    const ids = this.outgoingIndex.get(nodeId) ?? [];
    return ids.map((id) => this.graph.edges[id]).filter((e): e is GraphEdge => e !== undefined);
  }

  /** All edges where the given node is the target (callee / dependency). */
  incomingEdges(nodeId: string): ReadonlyArray<GraphEdge> {
    const ids = this.incomingIndex.get(nodeId) ?? [];
    return ids.map((id) => this.graph.edges[id]).filter((e): e is GraphEdge => e !== undefined);
  }

  /** All edge IDs of the given kind. */
  edgesOfKind(kind: EdgeKind): ReadonlyArray<string> {
    return this.edgesByKind.get(kind) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  get nodeCount(): number {
    return Object.keys(this.graph.nodes).length;
  }

  get edgeCount(): number {
    return Object.keys(this.graph.edges).length;
  }

  get fileCount(): number {
    return this.byFile.size;
  }

  // ---------------------------------------------------------------------------
  // Private — index construction
  // ---------------------------------------------------------------------------

  private buildIndex(): void {
    // ---- Nodes ----
    for (const node of Object.values(this.graph.nodes)) {
      const file = node.location.file;
      push(this.byFile, file, node.id);

      if (node.module) {
        push(this.byModule, node.module, node.id);
      }

      push(this.byKind, node.kind, node.id);
      push(this.byLanguage, node.language, node.id);
    }

    // ---- Edges ----
    for (const edge of Object.values(this.graph.edges)) {
      push(this.outgoingIndex, edge.sourceId, edge.id);
      push(this.incomingIndex, edge.targetId, edge.id);
      push(this.edgesByKind, edge.kind, edge.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function push<K>(map: Map<K, string[]>, key: K, value: string): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}

function nodeToRef(node: GraphNode): NodeRef {
  return {
    id: node.id,
    displayName: node.displayName,
    language: node.language,
    kind: node.kind,
    file: node.location.file,
    module: node.module,
  };
}
