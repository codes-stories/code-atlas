import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer } from "reactflow";
import type { EdgeProps } from "reactflow";

// ---------------------------------------------------------------------------
// Edge data
// ---------------------------------------------------------------------------

export interface AtlasEdgeData {
  kind: string;
  label: string;
  relationshipType: string;
}

// ---------------------------------------------------------------------------
// AtlasEdge — custom labeled bezier edge
// ---------------------------------------------------------------------------

export const AtlasEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<AtlasEdgeData>): React.ReactElement => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeClass = [
    "ca-edge",
    `ca-edge--${data?.kind ?? "call"}`,
    selected ? "ca-edge--selected" : "",
  ].filter(Boolean).join(" ");

  const showLabel = Boolean(data?.label);

  return (
    <>
      <path
        id={id}
        className={edgeClass}
        d={edgePath}
        markerEnd={markerEnd as string}
        fill="none"
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className={`ca-edge__label ca-edge__label--${data?.kind ?? "call"}`}
          >
            {data?.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
AtlasEdge.displayName = "AtlasEdge";

// ---------------------------------------------------------------------------
// edgeTypes map — passed to <ReactFlow edgeTypes={…} />
// ---------------------------------------------------------------------------

export const EDGE_TYPES = {
  atlasEdge: AtlasEdge,
} as const;
