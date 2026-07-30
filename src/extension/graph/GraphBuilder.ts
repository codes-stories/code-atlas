import type { CodeGraph, GraphNode, GraphEdge } from "../../shared/models";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Builder input
// ---------------------------------------------------------------------------

export interface BuildGraphInput {
  /** Workspace root directory. */
  readonly workspaceRoot: string;

  /** Nodes emitted by one or more parsers. Duplicates (same id) are silently deduplicated — last write wins. */
  readonly nodes: ReadonlyArray<GraphNode>;

  /** Edges emitted by one or more parsers. Duplicates (same id) are silently deduplicated — last write wins. */
  readonly edges: ReadonlyArray<GraphEdge>;

  /** Total number of files that were parsed to produce this input. */
  readonly fileCount: number;

  /** Wall-clock milliseconds spent parsing (sum across all parsers). */
  readonly parseTimeMs: number;
}

// ---------------------------------------------------------------------------
// GraphBuilder
// ---------------------------------------------------------------------------

/**
 * Assembles an immutable {@link CodeGraph} from raw parser output.
 *
 * Responsibilities:
 * - Index nodes and edges into `Record<string, …>` maps for O(1) lookup.
 * - Wire each node's `incomingEdgeIds` / `outgoingEdgeIds` from the edge list
 *   (parsers are not required to pre-populate these arrays).
 * - Collect the set of distinct languages present.
 * - Produce a stable snapshot ID and ISO-8601 timestamp.
 *
 * The builder never mutates its input arrays. All intermediate collections
 * are discarded after `build()` returns.
 */
export class GraphBuilder {
  /**
   * Constructs a {@link CodeGraph} from the provided input.
   *
   * Edge wiring: for every edge `e`, the builder adds `e.id` to
   * `source.outgoingEdgeIds` and `target.incomingEdgeIds`. This means
   * parsers can omit those arrays entirely — the builder is the authoritative
   * source of wiring.
   *
   * Dangling edges (source or target node not present in the node list) are
   * dropped silently. This handles the case where a parser emits a reference
   * to an external symbol that has no definition in the workspace.
   */
  build(input: BuildGraphInput): CodeGraph {
    const startMs = Date.now();

    // -----------------------------------------------------------------------
    // 1. Index nodes (last-write-wins on duplicate id)
    // -----------------------------------------------------------------------
    const nodeMap: Record<string, GraphNode> = {};
    for (const node of input.nodes) {
      nodeMap[node.id] = node;
    }

    // -----------------------------------------------------------------------
    // 2. Index edges, drop dangling, collect wiring sets
    // -----------------------------------------------------------------------
    const edgeMap: Record<string, GraphEdge> = {};

    // Mutable accumulator: node id → sets of edge ids
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();

    for (const edge of input.edges) {
      // Drop dangling edges.
      if (!(edge.sourceId in nodeMap) || !(edge.targetId in nodeMap)) {
        continue;
      }
      edgeMap[edge.id] = edge;

      if (!outgoing.has(edge.sourceId)) outgoing.set(edge.sourceId, new Set());
      if (!incoming.has(edge.targetId)) incoming.set(edge.targetId, new Set());

      outgoing.get(edge.sourceId)!.add(edge.id);
      incoming.get(edge.targetId)!.add(edge.id);
    }

    // -----------------------------------------------------------------------
    // 3. Rewrite nodes with wired edge id arrays
    //    Only touch nodes that actually have edges — avoids unnecessary object
    //    allocation for isolated nodes.
    // -----------------------------------------------------------------------
    for (const nodeId of Object.keys(nodeMap)) {
      const out = outgoing.get(nodeId);
      const inc = incoming.get(nodeId);
      if (!out && !inc) continue;

      const existing = nodeMap[nodeId]!;
      nodeMap[nodeId] = {
        ...existing,
        outgoingEdgeIds: out ? [...out] : existing.outgoingEdgeIds,
        incomingEdgeIds: inc ? [...inc] : existing.incomingEdgeIds,
      };
    }

    // -----------------------------------------------------------------------
    // 4. Collect distinct languages
    // -----------------------------------------------------------------------
    const languageSet = new Set<string>();
    for (const node of Object.values(nodeMap)) {
      if (node.language) languageSet.add(node.language);
    }

    const buildMs = Date.now() - startMs;

    return {
      id: randomUUID(),
      builtAt: new Date().toISOString(),
      workspaceRoot: input.workspaceRoot,
      nodes: nodeMap,
      edges: edgeMap,
      languages: [...languageSet].sort(),
      fileCount: input.fileCount,
      parseTimeMs: input.parseTimeMs + buildMs,
    };
  }

  /**
   * Produces an empty graph for a given workspace root.
   * Used as the initial state before any parsing has occurred.
   */
  empty(workspaceRoot: string): CodeGraph {
    return {
      id: randomUUID(),
      builtAt: new Date().toISOString(),
      workspaceRoot,
      nodes: {},
      edges: {},
      languages: [],
      fileCount: 0,
      parseTimeMs: 0,
    };
  }
}
