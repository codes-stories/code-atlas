import type { GraphNode, GraphEdge, CodeGraph, ComplexityMetrics, SourceLocation, SourceRange } from "../../src/shared/models";
import { NodeKind, EdgeKind, RelationshipType, ConditionKind } from "../../src/shared/enums";

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

export function loc(file: string, line = 1, column = 1): SourceLocation {
  return { file, line, column };
}

export function range(file: string, startLine = 1, endLine = 10): SourceRange {
  return {
    start: { file, line: startLine, column: 1 },
    end: { file, line: endLine, column: 1 },
  };
}

const DEFAULT_COMPLEXITY: ComplexityMetrics = {
  cyclomatic: 1,
  cognitive: 0,
  loc: 10,
  parameters: 0,
};

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

let nodeSeq = 0;

export function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  nodeSeq++;
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? `node_${nodeSeq}`,
    language: overrides.language ?? "erlang",
    kind: overrides.kind ?? NodeKind.Function,
    module: overrides.module ?? "my_module",
    signature: overrides.signature ?? `fun_${nodeSeq}/0`,
    location: overrides.location ?? loc(`/workspace/src/file_${nodeSeq}.erl`),
    range: overrides.range ?? range(`/workspace/src/file_${nodeSeq}.erl`),
    documentation: overrides.documentation ?? "",
    complexity: overrides.complexity ?? DEFAULT_COMPLEXITY,
    incomingEdgeIds: overrides.incomingEdgeIds ?? [],
    outgoingEdgeIds: overrides.outgoingEdgeIds ?? [],
    gitBlame: overrides.gitBlame ?? null,
    metadata: overrides.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Edge factory
// ---------------------------------------------------------------------------

let edgeSeq = 0;

export function makeEdge(overrides: Partial<GraphEdge> & { id: string; sourceId: string; targetId: string }): GraphEdge {
  edgeSeq++;
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    targetId: overrides.targetId,
    kind: overrides.kind ?? EdgeKind.Call,
    relationshipType: overrides.relationshipType ?? RelationshipType.FunctionCall,
    location: overrides.location ?? loc(`/workspace/src/file_${edgeSeq}.erl`),
    sourceCode: overrides.sourceCode ?? "caller:callee()",
    reason: overrides.reason ?? "",
    conditionKind: overrides.conditionKind ?? ConditionKind.Unconditional,
    conditionExpression: overrides.conditionExpression ?? "",
    examples: overrides.examples ?? [],
    metadata: overrides.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Graph factory
// ---------------------------------------------------------------------------

export function makeGraph(overrides: {
  workspaceRoot?: string;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  fileCount?: number;
}): CodeGraph {
  const nodes: Record<string, GraphNode> = {};
  const edges: Record<string, GraphEdge> = {};

  for (const n of overrides.nodes ?? []) nodes[n.id] = n;
  for (const e of overrides.edges ?? []) edges[e.id] = e;

  const languages = [...new Set((overrides.nodes ?? []).map((n) => n.language))];

  return {
    id: "test-graph",
    builtAt: new Date().toISOString(),
    workspaceRoot: overrides.workspaceRoot ?? "/workspace",
    nodes,
    edges,
    languages,
    fileCount: overrides.fileCount ?? (overrides.nodes?.length ?? 0),
    parseTimeMs: 0,
  };
}
