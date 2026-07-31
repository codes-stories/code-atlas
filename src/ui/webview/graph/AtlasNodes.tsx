import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import type { ComplexityMetrics, SourceLocation } from "../../../shared/models";

// ---------------------------------------------------------------------------
// Shared node data shape
// ---------------------------------------------------------------------------

export interface AtlasNodeData {
  label: string;
  signature: string;
  module: string;
  language: string;
  kind: string;
  complexity: ComplexityMetrics;
  isFocal: boolean;
  loc: SourceLocation;
}

// ---------------------------------------------------------------------------
// Shared handles — all node types expose the same connection points
// ---------------------------------------------------------------------------

function NodeHandles(): React.ReactElement {
  return (
    <>
      <Handle type="target" position={Position.Left} className="ca-node__handle ca-node__handle--target" />
      <Handle type="source" position={Position.Right} className="ca-node__handle ca-node__handle--source" />
    </>
  );
}

// ---------------------------------------------------------------------------
// FunctionNode — default for function/method symbols
// ---------------------------------------------------------------------------

export const FunctionNode = memo(({ data, selected }: NodeProps<AtlasNodeData>): React.ReactElement => {
  const classes = [
    "ca-node",
    "ca-node--function",
    selected ? "ca-node--selected" : "",
    data.isFocal ? "ca-node--focal" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label={`Function: ${data.label}`}>
      <NodeHandles />
      <div className="ca-node__header">
        <span className="ca-node__kind-icon" aria-hidden="true">ƒ</span>
        <span className="ca-node__label" title={data.signature}>{data.label}</span>
      </div>
      <div className="ca-node__meta">
        <span className="ca-node__module" title={data.module}>{data.module}</span>
        <span className="ca-node__complexity" title={`Cyclomatic: ${data.complexity.cyclomatic}`}>
          cc:{data.complexity.cyclomatic}
        </span>
      </div>
    </div>
  );
});
FunctionNode.displayName = "FunctionNode";

// ---------------------------------------------------------------------------
// ModuleNode — top-level module / namespace
// ---------------------------------------------------------------------------

export const ModuleNode = memo(({ data, selected }: NodeProps<AtlasNodeData>): React.ReactElement => {
  const classes = [
    "ca-node",
    "ca-node--module",
    selected ? "ca-node--selected" : "",
    data.isFocal ? "ca-node--focal" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label={`Module: ${data.label}`}>
      <NodeHandles />
      <div className="ca-node__header">
        <span className="ca-node__kind-icon" aria-hidden="true">◈</span>
        <span className="ca-node__label">{data.label}</span>
      </div>
      <div className="ca-node__meta">
        <span className="ca-node__lang-badge">{data.language}</span>
      </div>
    </div>
  );
});
ModuleNode.displayName = "ModuleNode";

// ---------------------------------------------------------------------------
// GenServerNode — OTP gen_server / actor process
// ---------------------------------------------------------------------------

export const GenServerNode = memo(({ data, selected }: NodeProps<AtlasNodeData>): React.ReactElement => {
  const classes = [
    "ca-node",
    "ca-node--genserver",
    selected ? "ca-node--selected" : "",
    data.isFocal ? "ca-node--focal" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label={`GenServer: ${data.label}`}>
      <NodeHandles />
      <div className="ca-node__header">
        <span className="ca-node__kind-icon" aria-hidden="true">⚙</span>
        <span className="ca-node__label">{data.label}</span>
      </div>
      <div className="ca-node__meta">
        <span className="ca-node__kind-badge">gen_server</span>
        <span className="ca-node__module">{data.module}</span>
      </div>
    </div>
  );
});
GenServerNode.displayName = "GenServerNode";

// ---------------------------------------------------------------------------
// nodeTypes map — passed directly to <ReactFlow nodeTypes={…} />
// ---------------------------------------------------------------------------

export const NODE_TYPES = {
  functionNode:  FunctionNode,
  moduleNode:    ModuleNode,
  genServerNode: GenServerNode,
} as const;
