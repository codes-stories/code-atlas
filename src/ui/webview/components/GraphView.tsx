import { useCallback, useMemo, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import { GraphLayoutEngine } from "../graph/GraphLayoutEngine";
import { NODE_TYPES }        from "../graph/AtlasNodes";
import { EDGE_TYPES }        from "../graph/AtlasEdges";
import { GraphToolbar }      from "./GraphToolbar";
import { StatusBar }         from "./StatusBar";
import {
  useAtlasStore,
  selectGraph,
  selectFocalNodeId,
  selectLayout,
} from "../store/store";

// ---------------------------------------------------------------------------
// GraphLayoutEngine singleton — stateless, safe to share
// ---------------------------------------------------------------------------

const layoutEngine = new GraphLayoutEngine();

// ---------------------------------------------------------------------------
// GraphViewInner — must be inside <ReactFlowProvider>
// ---------------------------------------------------------------------------

function GraphViewInner(): React.ReactElement {
  const graph       = useAtlasStore(selectGraph);
  const focalNodeId = useAtlasStore(selectFocalNodeId);
  const layout      = useAtlasStore(selectLayout);

  const requestNodeDetails = useAtlasStore((s) => s.requestNodeDetails);
  const requestEdgeDetails = useAtlasStore((s) => s.requestEdgeDetails);

  // --------------------------------------------------------------------------
  // Derived layout — recomputed whenever the graph snapshot or layout changes
  // --------------------------------------------------------------------------

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graph) return { initialNodes: [], initialEdges: [] };
    const { nodes, edges } = layoutEngine.layout(graph, layout, focalNodeId);
    return { initialNodes: nodes, initialEdges: edges };
  }, [graph, layout, focalNodeId]);

  // --------------------------------------------------------------------------
  // React Flow state
  // --------------------------------------------------------------------------

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when layout or graph changes
  const layoutKey = useRef<string>("");
  useEffect(() => {
    const key = `${graph?.id ?? ""}:${layout}:${focalNodeId ?? ""}`;
    if (key !== layoutKey.current) {
      layoutKey.current = key;
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, graph, layout, focalNodeId, setNodes, setEdges]);

  // --------------------------------------------------------------------------
  // Click handlers
  // --------------------------------------------------------------------------

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      requestNodeDetails(node.id);
    },
    [requestNodeDetails],
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      requestEdgeDetails(edge.id);
    },
    [requestEdgeDetails],
  );

  // Connect handler — no-op in read-only mode (graph is built by the parser)
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges],
  );

  // --------------------------------------------------------------------------
  // Empty state
  // --------------------------------------------------------------------------

  if (!graph) {
    return (
      <div className="ca-graph ca-graph--empty" role="main" aria-label="Graph canvas">
        <span>No graph data available.</span>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Full canvas
  // --------------------------------------------------------------------------

  return (
    <div className="ca-graph" role="main" aria-label="Code relationship graph">
      <GraphToolbar />

      <div className="ca-graph__body">
        <div className="ca-graph__canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.05}
            maxZoom={3}
            deleteKeyCode={null}
            attributionPosition="bottom-right"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="var(--ca-border)"
            />
            <MiniMap
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={2}
              zoomable
              pannable
              style={{ bottom: 48 }}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphView — wraps inner component in ReactFlowProvider
// ---------------------------------------------------------------------------

/**
 * Main graph canvas component, rendered when `view === "graph"`.
 *
 * Architecture:
 * - `<ReactFlowProvider>` wraps the inner component so `useReactFlow()`
 *   hooks (used in GraphToolbar) work correctly.
 * - `GraphLayoutEngine` converts the `CodeGraph` snapshot to React Flow
 *   nodes/edges using the Dagre layout algorithm.
 * - `NODE_TYPES` and `EDGE_TYPES` provide custom renderers.
 * - Node clicks → `requestNodeDetails(nodeId)` → extension host → `receiveNodeDetails`.
 * - Edge clicks → `requestEdgeDetails(edgeId)` → extension host → `receiveEdgeDetails`.
 */
export function GraphView(): React.ReactElement {
  return (
    <ReactFlowProvider>
      <GraphViewInner />
    </ReactFlowProvider>
  );
}

// ---------------------------------------------------------------------------
// Minimap helpers
// ---------------------------------------------------------------------------

function minimapNodeColor(node: Node): string {
  switch (node.type) {
    case "moduleNode":    return "#1e4a6e";
    case "genServerNode": return "#3a1e5c";
    default:              return "#2a2a4e";
  }
}
