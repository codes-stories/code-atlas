import { useCallback } from "react";
import { useAtlasStore, selectSelectedItem } from "../store/store";
import type { GraphNode, GraphEdge } from "../../../shared/models";
import { ConditionKind } from "../../../shared/enums";

// ---------------------------------------------------------------------------
// DetailPanel
// ---------------------------------------------------------------------------

/**
 * Side-panel that displays details about the currently selected node or edge.
 * Renders nothing when no item is selected.
 */
export function DetailPanel(): React.ReactElement | null {
  const selectedItem = useAtlasStore(selectSelectedItem);
  const clearSelection = useAtlasStore((s) => s.clearSelection);

  if (!selectedItem) return null;

  return (
    <aside className="ca-detail-panel" aria-label="Detail panel">
      <div className="ca-detail-panel__header">
        <span className="ca-detail-panel__title">
          {selectedItem.kind === "node" ? "Node Details" : "Edge Details"}
        </span>
        <button
          type="button"
          className="ca-detail-panel__close"
          onClick={clearSelection}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      <div className="ca-detail-panel__body">
        {selectedItem.kind === "node" && (
          <NodeDetail
            node={selectedItem.node}
            incomingEdges={selectedItem.incomingEdges}
            outgoingEdges={selectedItem.outgoingEdges}
          />
        )}
        {selectedItem.kind === "edge" && (
          <EdgeDetail
            edge={selectedItem.edge}
            sourceNode={selectedItem.sourceNode}
            targetNode={selectedItem.targetNode}
          />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// NodeDetail
// ---------------------------------------------------------------------------

interface NodeDetailProps {
  readonly node: GraphNode;
  readonly incomingEdges: ReadonlyArray<GraphEdge>;
  readonly outgoingEdges: ReadonlyArray<GraphEdge>;
}

function NodeDetail({ node, incomingEdges, outgoingEdges }: NodeDetailProps): React.ReactElement {
  const openInEditor = useAtlasStore((s) => s.openInEditor);

  const handleOpen = useCallback(() => {
    openInEditor(node.location.file, node.location.line, node.location.column);
  }, [openInEditor, node.location]);

  return (
    <div className="ca-detail-panel__node">
      {/* Header row */}
      <div className="ca-detail-panel__symbol-header">
        <span className="ca-detail-panel__kind-badge ca-detail-panel__kind-badge--node">
          {node.kind}
        </span>
        <span className="ca-detail-panel__name">{node.displayName}</span>
      </div>

      {/* Signature */}
      {node.signature && (
        <Section title="Signature">
          <code className="ca-detail-panel__code">{node.signature}</code>
        </Section>
      )}

      {/* Documentation */}
      {node.documentation && (
        <Section title="Documentation">
          <p className="ca-detail-panel__doc">{node.documentation}</p>
        </Section>
      )}

      {/* Location */}
      <Section title="Location">
        <button
          type="button"
          className="ca-detail-panel__location-link"
          onClick={handleOpen}
          title="Open in editor"
        >
          {formatLocation(node.location)}
        </button>
      </Section>

      {/* Metrics */}
      <Section title="Metrics">
        <dl className="ca-detail-panel__metrics">
          <MetricRow label="Cyclomatic" value={node.complexity.cyclomatic} />
          <MetricRow label="Cognitive"  value={node.complexity.cognitive}  />
          <MetricRow label="LOC"        value={node.complexity.loc}        />
          <MetricRow label="Parameters" value={node.complexity.parameters} />
        </dl>
      </Section>

      {/* Module */}
      {node.module && (
        <Section title="Module">
          <span className="ca-detail-panel__mono">{node.module}</span>
        </Section>
      )}

      {/* Incoming edges */}
      {incomingEdges.length > 0 && (
        <Section title={`Incoming (${incomingEdges.length})`}>
          <EdgeList edges={incomingEdges} nodeId={node.id} direction="incoming" />
        </Section>
      )}

      {/* Outgoing edges */}
      {outgoingEdges.length > 0 && (
        <Section title={`Outgoing (${outgoingEdges.length})`}>
          <EdgeList edges={outgoingEdges} nodeId={node.id} direction="outgoing" />
        </Section>
      )}

      {/* Git blame */}
      {node.gitBlame && (
        <Section title="Last changed">
          <dl className="ca-detail-panel__metrics">
            <MetricRow label="Author" value={node.gitBlame.author} />
            <MetricRow label="Date"   value={node.gitBlame.date}   />
            <MetricRow label="Commit" value={node.gitBlame.commit.slice(0, 8)} />
          </dl>
          {node.gitBlame.summary && (
            <p className="ca-detail-panel__blame-summary">{node.gitBlame.summary}</p>
          )}
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EdgeDetail
// ---------------------------------------------------------------------------

interface EdgeDetailProps {
  readonly edge: GraphEdge;
  readonly sourceNode: GraphNode;
  readonly targetNode: GraphNode;
}

function EdgeDetail({ edge, sourceNode, targetNode }: EdgeDetailProps): React.ReactElement {
  const openInEditor = useAtlasStore((s) => s.openInEditor);

  const handleOpen = useCallback(() => {
    openInEditor(edge.location.file, edge.location.line, edge.location.column);
  }, [openInEditor, edge.location]);

  const isConditional = edge.conditionKind !== ConditionKind.Unconditional;

  return (
    <div className="ca-detail-panel__edge">
      {/* Kind badge */}
      <div className="ca-detail-panel__symbol-header">
        <span className="ca-detail-panel__kind-badge ca-detail-panel__kind-badge--edge">
          {edge.kind}
        </span>
        <span className="ca-detail-panel__name">{edge.relationshipType}</span>
      </div>

      {/* Source → Target */}
      <Section title="Relationship">
        <div className="ca-detail-panel__edge-flow">
          <span className="ca-detail-panel__edge-node">{sourceNode.displayName}</span>
          <span className="ca-detail-panel__edge-arrow" aria-hidden="true">→</span>
          <span className="ca-detail-panel__edge-node">{targetNode.displayName}</span>
        </div>
      </Section>

      {/* Condition */}
      {isConditional && (
        <Section title="Condition">
          <dl className="ca-detail-panel__metrics">
            <MetricRow label="Kind"       value={edge.conditionKind}       />
            {edge.conditionExpression && (
              <MetricRow label="Expression" value={edge.conditionExpression} />
            )}
          </dl>
        </Section>
      )}

      {/* Source code snippet */}
      {edge.sourceCode && (
        <Section title="Call site">
          <pre className="ca-detail-panel__pre"><code>{edge.sourceCode}</code></pre>
        </Section>
      )}

      {/* Location */}
      <Section title="Location">
        <button
          type="button"
          className="ca-detail-panel__location-link"
          onClick={handleOpen}
          title="Open in editor"
        >
          {formatLocation(edge.location)}
        </button>
      </Section>

      {/* Reason */}
      {edge.reason && (
        <Section title="Reason">
          <p className="ca-detail-panel__doc">{edge.reason}</p>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="ca-detail-panel__section">
      <h3 className="ca-detail-panel__section-title">{title}</h3>
      <div className="ca-detail-panel__section-content">{children}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number | string }): React.ReactElement {
  return (
    <>
      <dt className="ca-detail-panel__metric-label">{label}</dt>
      <dd className="ca-detail-panel__metric-value">{value}</dd>
    </>
  );
}

interface EdgeListProps {
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly nodeId: string;
  readonly direction: "incoming" | "outgoing";
}

function EdgeList({ edges, nodeId, direction }: EdgeListProps): React.ReactElement {
  const requestEdgeDetails = useAtlasStore((s) => s.requestEdgeDetails);

  return (
    <ul className="ca-detail-panel__edge-list">
      {edges.map((edge) => {
        const peerId = direction === "incoming" ? edge.sourceId : edge.targetId;
        const label = `${edge.kind} → ${peerId === nodeId ? "(self)" : peerId.slice(0, 24)}`;
        return (
          <li key={edge.id} className="ca-detail-panel__edge-list-item">
            <button
              type="button"
              className="ca-detail-panel__edge-list-btn"
              onClick={() => { requestEdgeDetails(edge.id); }}
              title={edge.id}
            >
              <span className={`ca-detail-panel__edge-kind ca-detail-panel__edge-kind--${edge.kind}`}>
                {edge.kind}
              </span>
              <span className="ca-detail-panel__edge-peer">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLocation(loc: { file: string; line: number; column: number }): string {
  const shortFile = loc.file.split("/").slice(-2).join("/");
  return `${shortFile}:${loc.line}:${loc.column}`;
}
