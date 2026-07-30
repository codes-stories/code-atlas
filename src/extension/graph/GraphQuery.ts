import type { CodeGraph, GraphNode, GraphEdge } from "../../shared/models";
import type { EdgeKind } from "../../shared/enums";
import type { GraphIndex } from "./GraphIndex";

// ---------------------------------------------------------------------------
// Query option types
// ---------------------------------------------------------------------------

/** Direction of traversal from a starting node. */
export type TraversalDirection = "outgoing" | "incoming" | "both";

export interface NeighbourhoodOptions {
  /** Maximum hops from the root node. 1 = direct neighbours only. Default: 2. */
  readonly maxDepth?: number;
  /** Restrict traversal to edges of these kinds. All kinds when omitted. */
  readonly edgeKinds?: ReadonlyArray<EdgeKind>;
  /** Direction to follow edges. Default: "both". */
  readonly direction?: TraversalDirection;
  /** Maximum total nodes to return (prevents runaway on dense graphs). Default: 500. */
  readonly maxNodes?: number;
}

export interface PathOptions {
  /** Restrict traversal to edges of these kinds. All kinds when omitted. */
  readonly edgeKinds?: ReadonlyArray<EdgeKind>;
  /** Maximum path length in hops. Default: 20. */
  readonly maxDepth?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * A subgraph centred on a focal node, containing only the nodes and edges
 * reachable within the specified depth.
 */
export interface NeighbourhoodResult {
  /** The focal node id the query started from. */
  readonly rootId: string;
  /** All reachable nodes, keyed by id. Includes the root. */
  readonly nodes: Readonly<Record<string, GraphNode>>;
  /** All edges connecting the reachable nodes, keyed by id. */
  readonly edges: Readonly<Record<string, GraphEdge>>;
  /** For each node id, its BFS depth from the root (root = 0). */
  readonly depths: Readonly<Record<string, number>>;
}

/** A single path between two nodes expressed as ordered node ids. */
export interface GraphPath {
  /** Ordered node IDs from source to target (both inclusive). */
  readonly nodeIds: ReadonlyArray<string>;
  /** Ordered edge IDs traversed (length = nodeIds.length - 1). */
  readonly edgeIds: ReadonlyArray<string>;
}

/** Describes a detected cycle in the graph. */
export interface CycleResult {
  /** Node IDs forming the cycle, in traversal order. The first and last IDs are the same. */
  readonly nodeIds: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// GraphQuery
// ---------------------------------------------------------------------------

/**
 * Stateless query engine for an immutable {@link CodeGraph}.
 *
 * Every method is a pure function — it reads from `graph` and `index` but
 * never mutates them. Multiple queries can run concurrently.
 */
export class GraphQuery {
  constructor(
    private readonly graph: CodeGraph,
    private readonly index: GraphIndex,
  ) {}

  // ---------------------------------------------------------------------------
  // Neighbourhood
  // ---------------------------------------------------------------------------

  /**
   * Returns the subgraph containing all nodes reachable from `rootId` within
   * `maxDepth` hops, using BFS.
   *
   * Returns null when `rootId` is not present in the graph.
   */
  neighbourhood(rootId: string, options: NeighbourhoodOptions = {}): NeighbourhoodResult | null {
    if (!(rootId in this.graph.nodes)) return null;

    const maxDepth = options.maxDepth ?? 2;
    const maxNodes = options.maxNodes ?? 500;
    const direction = options.direction ?? "both";
    const kindFilter = options.edgeKinds ? new Set(options.edgeKinds) : null;

    const resultNodes: Record<string, GraphNode> = {};
    const resultEdges: Record<string, GraphEdge> = {};
    const depths: Record<string, number> = {};

    // BFS queue: [nodeId, depth]
    const queue: Array<[string, number]> = [[rootId, 0]];
    const visited = new Set<string>([rootId]);

    resultNodes[rootId] = this.graph.nodes[rootId]!;
    depths[rootId] = 0;

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [nodeId, depth] = item;

      if (depth >= maxDepth) continue;
      if (Object.keys(resultNodes).length >= maxNodes) break;

      const candidates = this.collectCandidateEdges(nodeId, direction, kindFilter);

      for (const { edge, neighbourId } of candidates) {
        if (!(neighbourId in this.graph.nodes)) continue;
        if (Object.keys(resultNodes).length >= maxNodes) break;

        resultEdges[edge.id] = edge;

        if (!visited.has(neighbourId)) {
          visited.add(neighbourId);
          const neighbour = this.graph.nodes[neighbourId]!;
          resultNodes[neighbourId] = neighbour;
          depths[neighbourId] = depth + 1;
          queue.push([neighbourId, depth + 1]);
        }
      }
    }

    return { rootId, nodes: resultNodes, edges: resultEdges, depths };
  }

  // ---------------------------------------------------------------------------
  // Path finding (BFS shortest path)
  // ---------------------------------------------------------------------------

  /**
   * Finds the shortest directed path from `sourceId` to `targetId`.
   * Follows outgoing edges only (directed graph semantics).
   *
   * Returns null when no path exists or either node is absent.
   */
  shortestPath(
    sourceId: string,
    targetId: string,
    options: PathOptions = {},
  ): GraphPath | null {
    if (!(sourceId in this.graph.nodes)) return null;
    if (!(targetId in this.graph.nodes)) return null;
    if (sourceId === targetId) {
      return { nodeIds: [sourceId], edgeIds: [] };
    }

    const maxDepth = options.maxDepth ?? 20;
    const kindFilter = options.edgeKinds ? new Set(options.edgeKinds) : null;

    // BFS — track parent for path reconstruction
    const parentNode = new Map<string, string>(); // child → parent node id
    const parentEdge = new Map<string, string>(); // child → edge id that got us here
    const visited = new Set<string>([sourceId]);
    const queue: Array<[string, number]> = [[sourceId, 0]];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [nodeId, depth] = item;

      if (depth >= maxDepth) continue;

      for (const edge of this.index.outgoingEdges(nodeId)) {
        if (kindFilter && !kindFilter.has(edge.kind)) continue;

        const next = edge.targetId;
        if (visited.has(next)) continue;

        visited.add(next);
        parentNode.set(next, nodeId);
        parentEdge.set(next, edge.id);

        if (next === targetId) {
          return this.reconstructPath(sourceId, targetId, parentNode, parentEdge);
        }

        queue.push([next, depth + 1]);
      }
    }

    return null;
  }

  /**
   * Finds ALL simple paths from `sourceId` to `targetId` up to `maxDepth` hops.
   * Uses DFS with backtracking. Results are sorted shortest-first.
   *
   * Capped at 50 paths to prevent combinatorial explosion on dense graphs.
   */
  allPaths(
    sourceId: string,
    targetId: string,
    options: PathOptions = {},
  ): ReadonlyArray<GraphPath> {
    if (!(sourceId in this.graph.nodes)) return [];
    if (!(targetId in this.graph.nodes)) return [];

    const maxDepth = options.maxDepth ?? 10;
    const kindFilter = options.edgeKinds ? new Set(options.edgeKinds) : null;
    const results: GraphPath[] = [];
    const MAX_RESULTS = 50;

    const dfs = (
      nodeId: string,
      visitedNodes: Set<string>,
      nodeStack: string[],
      edgeStack: string[],
    ): void => {
      if (results.length >= MAX_RESULTS) return;
      if (nodeStack.length > maxDepth + 1) return;

      if (nodeId === targetId && nodeStack.length > 1) {
        results.push({
          nodeIds: [...nodeStack],
          edgeIds: [...edgeStack],
        });
        return;
      }

      for (const edge of this.index.outgoingEdges(nodeId)) {
        if (kindFilter && !kindFilter.has(edge.kind)) continue;
        const next = edge.targetId;
        if (visitedNodes.has(next)) continue;

        visitedNodes.add(next);
        nodeStack.push(next);
        edgeStack.push(edge.id);

        dfs(next, visitedNodes, nodeStack, edgeStack);

        nodeStack.pop();
        edgeStack.pop();
        visitedNodes.delete(next);
      }
    };

    const visitedNodes = new Set<string>([sourceId]);
    dfs(sourceId, visitedNodes, [sourceId], []);

    return results.sort((a, b) => a.nodeIds.length - b.nodeIds.length);
  }

  // ---------------------------------------------------------------------------
  // Cycle detection
  // ---------------------------------------------------------------------------

  /**
   * Detects all cycles reachable from `startId` using DFS.
   * Returns at most `maxCycles` cycles (default 20).
   *
   * Each cycle is represented as a path where the first and last node IDs
   * are the same.
   */
  detectCycles(startId: string, maxCycles = 20): ReadonlyArray<CycleResult> {
    if (!(startId in this.graph.nodes)) return [];

    const cycles: CycleResult[] = [];
    const globalVisited = new Set<string>();

    const dfs = (nodeId: string, stack: string[], onStack: Set<string>): void => {
      if (cycles.length >= maxCycles) return;

      globalVisited.add(nodeId);
      onStack.add(nodeId);
      stack.push(nodeId);

      for (const edge of this.index.outgoingEdges(nodeId)) {
        const next = edge.targetId;

        if (onStack.has(next)) {
          // Found a cycle — extract the cycle portion of the stack.
          const cycleStart = stack.indexOf(next);
          const cycleNodes = [...stack.slice(cycleStart), next];
          cycles.push({ nodeIds: cycleNodes });
        } else if (!globalVisited.has(next)) {
          dfs(next, stack, onStack);
        }

        if (cycles.length >= maxCycles) return;
      }

      stack.pop();
      onStack.delete(nodeId);
    };

    dfs(startId, [], new Set());
    return cycles;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private collectCandidateEdges(
    nodeId: string,
    direction: TraversalDirection,
    kindFilter: Set<EdgeKind> | null,
  ): Array<{ edge: GraphEdge; neighbourId: string }> {
    const results: Array<{ edge: GraphEdge; neighbourId: string }> = [];

    if (direction === "outgoing" || direction === "both") {
      for (const edge of this.index.outgoingEdges(nodeId)) {
        if (kindFilter && !kindFilter.has(edge.kind)) continue;
        results.push({ edge, neighbourId: edge.targetId });
      }
    }

    if (direction === "incoming" || direction === "both") {
      for (const edge of this.index.incomingEdges(nodeId)) {
        if (kindFilter && !kindFilter.has(edge.kind)) continue;
        results.push({ edge, neighbourId: edge.sourceId });
      }
    }

    return results;
  }

  private reconstructPath(
    sourceId: string,
    targetId: string,
    parentNode: Map<string, string>,
    parentEdge: Map<string, string>,
  ): GraphPath {
    const nodeIds: string[] = [];
    const edgeIds: string[] = [];

    let current = targetId;
    while (current !== sourceId) {
      nodeIds.unshift(current);
      const edgeId = parentEdge.get(current)!;
      edgeIds.unshift(edgeId);
      current = parentNode.get(current)!;
    }
    nodeIds.unshift(sourceId);

    return { nodeIds, edgeIds };
  }
}
