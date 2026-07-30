import { useAtlasStore, selectGraph, selectFocalNodeId } from "../store/store";
import { StatusBar } from "./StatusBar";

/**
 * The main graph canvas view, shown when `view === "graph"`.
 *
 * Phase 7 will replace the placeholder `<canvas>` element with a full
 * React Flow instance. The layout, toolbar, and detail panel will also
 * be added then.
 *
 * For now this component:
 * - Confirms the graph is present in the store
 * - Renders the StatusBar
 * - Displays a placeholder that clearly communicates what will be here
 */
export function GraphView(): React.ReactElement {
  const graph = useAtlasStore(selectGraph);
  const focalNodeId = useAtlasStore(selectFocalNodeId);

  if (!graph) {
    // Should not happen: App only renders GraphView when view === "graph",
    // and receiveGraph() always sets a non-null graph before switching
    // the view state. Guard defensively.
    return (
      <div className="ca-graph ca-graph--empty" role="main" aria-label="Graph canvas">
        <span>No graph data available.</span>
      </div>
    );
  }

  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = Object.keys(graph.edges).length;

  return (
    <div className="ca-graph" role="main" aria-label="Code relationship graph">
      {/* Placeholder — replaced with <ReactFlow> in Phase 7 */}
      <div className="ca-graph__canvas-placeholder" aria-hidden="true">
        <div className="ca-graph__placeholder-content">
          <div className="ca-graph__placeholder-icon">&#x1F5FA;</div>
          <p className="ca-graph__placeholder-title">Graph canvas</p>
          <p className="ca-graph__placeholder-subtitle">
            React Flow rendering arrives in Phase 7
          </p>
          <dl className="ca-graph__placeholder-stats">
            <dt>Nodes</dt>
            <dd>{nodeCount.toLocaleString()}</dd>
            <dt>Edges</dt>
            <dd>{edgeCount.toLocaleString()}</dd>
            <dt>Languages</dt>
            <dd>{graph.languages.join(", ") || "—"}</dd>
            {focalNodeId && (
              <>
                <dt>Focal node</dt>
                <dd>{focalNodeId}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
