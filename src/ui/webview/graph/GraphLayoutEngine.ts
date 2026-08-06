import dagre from "@dagrejs/dagre";
import { MarkerType } from "reactflow";
import type { Node as RFNode, Edge as RFEdge } from "reactflow";
import type { CodeGraph } from "../../../shared/models";
import type { LayoutAlgorithm } from "../../../shared/enums";

// ---------------------------------------------------------------------------
// Layout options
// ---------------------------------------------------------------------------

export interface LayoutOptions {
  /** Graph layout direction. LR = left-to-right, TB = top-to-bottom. */
  readonly rankdir: "LR" | "TB";
  /** Minimum space between nodes horizontally. */
  readonly nodeSepX: number;
  /** Minimum space between ranks (rows/columns). */
  readonly rankSep: number;
}

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 56;

const LAYOUT_CONFIGS: Record<string, LayoutOptions> = {
  dagre:      { rankdir: "LR", nodeSepX: 60,  rankSep: 120 },
  horizontal: { rankdir: "LR", nodeSepX: 60,  rankSep: 120 },
  vertical:   { rankdir: "TB", nodeSepX: 80,  rankSep: 100 },
  tree:       { rankdir: "TB", nodeSepX: 60,  rankSep: 80  },
  force:      { rankdir: "LR", nodeSepX: 60,  rankSep: 120 }, // fallback
  radial:     { rankdir: "LR", nodeSepX: 60,  rankSep: 120 }, // fallback
};

// ---------------------------------------------------------------------------
// GraphLayoutEngine
// ---------------------------------------------------------------------------

/**
 * Converts a {@link CodeGraph} snapshot into React Flow node/edge arrays with
 * Dagre-computed x/y positions.
 *
 * One instance is stateless — `layout()` can be called any number of times.
 */
export class GraphLayoutEngine {
  /**
   * Runs Dagre layout on the graph and returns positioned React Flow nodes
   * and edges.
   *
   * @param graph         The CodeGraph snapshot to lay out.
   * @param algorithm     The layout algorithm selected by the user.
   * @param focalNodeId   When set, the focal node is highlighted in the data.
   * @param maxNodes      Safety cap — only the first N nodes are rendered.
   */
  layout(
    graph: CodeGraph,
    algorithm: LayoutAlgorithm,
    focalNodeId: string | null,
    maxNodes = 500,
  ): { nodes: RFNode[]; edges: RFEdge[] } {
    const opts = LAYOUT_CONFIGS[algorithm] ?? LAYOUT_CONFIGS["dagre"]!;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: opts.rankdir,
      nodesep: opts.nodeSepX,
      ranksep: opts.rankSep,
      marginx: 40,
      marginy: 40,
    });

    // --- Add nodes ---
    const nodeIds = Object.keys(graph.nodes).slice(0, maxNodes);
    const nodeSet = new Set(nodeIds);

    for (const id of nodeIds) {
      g.setNode(id, { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT });
    }

    // --- Add edges (only between nodes in the visible set) ---
    const edgeIds = Object.keys(graph.edges);
    const visibleEdgeIds: string[] = [];

    for (const edgeId of edgeIds) {
      const edge = graph.edges[edgeId]!;
      if (nodeSet.has(edge.sourceId) && nodeSet.has(edge.targetId)) {
        // Dagre needs unique edge names when there are parallel edges
        g.setEdge(edge.sourceId, edge.targetId, {}, edgeId);
        visibleEdgeIds.push(edgeId);
      }
    }

    // --- Run layout ---
    dagre.layout(g);

    // --- Build React Flow nodes ---
    const rfNodes: RFNode[] = nodeIds.map((id) => {
      const dagreNode = g.node(id);
      const graphNode = graph.nodes[id]!;

      return {
        id,
        type: rfNodeType(graphNode.kind as string),
        position: {
          x: (dagreNode?.x ?? 0) - DEFAULT_NODE_WIDTH / 2,
          y: (dagreNode?.y ?? 0) - DEFAULT_NODE_HEIGHT / 2,
        },
        data: {
          label: graphNode.displayName,
          signature: graphNode.signature,
          module: graphNode.module,
          language: graphNode.language,
          kind: graphNode.kind,
          complexity: graphNode.complexity,
          isFocal: id === focalNodeId,
          loc: graphNode.location,
        },
      };
    });

    // --- Build React Flow edges ---
    const rfEdges: RFEdge[] = visibleEdgeIds.map((edgeId) => {
      const edge = graph.edges[edgeId]!;
      return {
        id: edgeId,
        source: edge.sourceId,
        target: edge.targetId,
        type: "atlasEdge",
        animated: edge.kind === "spawn" || edge.kind === "async",
        data: {
          kind: edge.kind,
          label: edgeLabel(edge.kind as string),
          relationshipType: edge.relationshipType,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rfNodeType(kind: string): string {
  switch (kind) {
    case "module":      return "moduleNode";
    case "gen_server":  return "genServerNode";
    case "actor":       return "genServerNode";
    default:            return "functionNode";
  }
}

function edgeLabel(kind: string): string {
  switch (kind) {
    case "call":       return "";
    case "spawn":      return "spawn";
    case "async":      return "async";
    case "publish":    return "pub";
    case "subscribe":  return "sub";
    case "reads":      return "read";
    case "writes":     return "write";
    case "imports":    return "import";
    case "implements": return "impl";
    case "extends":    return "extends";
    default:           return kind;
  }
}
