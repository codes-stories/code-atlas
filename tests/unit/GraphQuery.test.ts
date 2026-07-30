import { describe, it, expect, beforeEach } from "vitest";
import { GraphQuery } from "../../src/extension/graph/GraphQuery";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import { GraphIndex } from "../../src/extension/graph/GraphIndex";
import { EdgeKind } from "../../src/shared/enums";
import { makeNode, makeEdge } from "./fixtures";
import type { CodeGraph } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Helper — build graph+index+query from raw nodes and edges
// ---------------------------------------------------------------------------

function buildQuery(
  nodes: ReturnType<typeof makeNode>[],
  edges: ReturnType<typeof makeEdge>[] = [],
): { query: GraphQuery; graph: CodeGraph } {
  const builder = new GraphBuilder();
  const graph = builder.build({
    workspaceRoot: "/workspace",
    nodes,
    edges,
    fileCount: nodes.length,
    parseTimeMs: 0,
  });
  const index = new GraphIndex(graph);
  const query = new GraphQuery(graph, index);
  return { query, graph };
}

// ---------------------------------------------------------------------------
// neighbourhood()
// ---------------------------------------------------------------------------

describe("neighbourhood()", () => {
  it("returns null for an unknown root node", () => {
    const { query } = buildQuery([]);
    expect(query.neighbourhood("ghost")).toBeNull();
  });

  it("returns only the root when it has no edges", () => {
    const n = makeNode({ id: "root" });
    const { query } = buildQuery([n]);
    const result = query.neighbourhood("root");
    expect(result).not.toBeNull();
    expect(Object.keys(result!.nodes)).toHaveLength(1);
    expect(result!.nodes["root"]).toBeDefined();
  });

  it("includes direct neighbours at depth=1", () => {
    const root = makeNode({ id: "root" });
    const child = makeNode({ id: "child" });
    const e = makeEdge({ id: "e1", sourceId: "root", targetId: "child" });
    const { query } = buildQuery([root, child], [e]);
    const result = query.neighbourhood("root", { maxDepth: 1 });
    expect(result!.nodes["child"]).toBeDefined();
    expect(result!.depths["child"]).toBe(1);
  });

  it("does not go beyond maxDepth", () => {
    // root → a → b → c (chain)
    const root = makeNode({ id: "root" });
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c = makeNode({ id: "c" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "root", targetId: "a" }),
      makeEdge({ id: "e2", sourceId: "a", targetId: "b" }),
      makeEdge({ id: "e3", sourceId: "b", targetId: "c" }),
    ];
    const { query } = buildQuery([root, a, b, c], edges);
    const result = query.neighbourhood("root", { maxDepth: 2 });
    expect(result!.nodes["a"]).toBeDefined();
    expect(result!.nodes["b"]).toBeDefined();
    expect(result!.nodes["c"]).toBeUndefined(); // depth 3 — excluded
  });

  it("root depth is always 0", () => {
    const n = makeNode({ id: "root" });
    const { query } = buildQuery([n]);
    const result = query.neighbourhood("root");
    expect(result!.depths["root"]).toBe(0);
  });

  it("respects edgeKind filter — excludes edges of other kinds", () => {
    const root = makeNode({ id: "root" });
    const call_target = makeNode({ id: "call_target" });
    const spawn_target = makeNode({ id: "spawn_target" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "root", targetId: "call_target", kind: EdgeKind.Call }),
      makeEdge({ id: "e2", sourceId: "root", targetId: "spawn_target", kind: EdgeKind.Spawn }),
    ];
    const { query } = buildQuery([root, call_target, spawn_target], edges);
    const result = query.neighbourhood("root", { edgeKinds: [EdgeKind.Call], maxDepth: 1 });
    expect(result!.nodes["call_target"]).toBeDefined();
    expect(result!.nodes["spawn_target"]).toBeUndefined();
  });

  it("direction=outgoing excludes incoming neighbours", () => {
    const root = makeNode({ id: "root" });
    const caller = makeNode({ id: "caller" });
    const callee = makeNode({ id: "callee" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "caller", targetId: "root" }),
      makeEdge({ id: "e2", sourceId: "root", targetId: "callee" }),
    ];
    const { query } = buildQuery([root, caller, callee], edges);
    const result = query.neighbourhood("root", { direction: "outgoing", maxDepth: 1 });
    expect(result!.nodes["callee"]).toBeDefined();
    expect(result!.nodes["caller"]).toBeUndefined();
  });

  it("direction=incoming excludes outgoing neighbours", () => {
    const root = makeNode({ id: "root" });
    const caller = makeNode({ id: "caller" });
    const callee = makeNode({ id: "callee" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "caller", targetId: "root" }),
      makeEdge({ id: "e2", sourceId: "root", targetId: "callee" }),
    ];
    const { query } = buildQuery([root, caller, callee], edges);
    const result = query.neighbourhood("root", { direction: "incoming", maxDepth: 1 });
    expect(result!.nodes["caller"]).toBeDefined();
    expect(result!.nodes["callee"]).toBeUndefined();
  });

  it("respects maxNodes cap", () => {
    const root = makeNode({ id: "root" });
    const children = Array.from({ length: 10 }, (_, i) => makeNode({ id: `c${i}` }));
    const edges = children.map((c, i) =>
      makeEdge({ id: `e${i}`, sourceId: "root", targetId: c.id }),
    );
    const { query } = buildQuery([root, ...children], edges);
    const result = query.neighbourhood("root", { maxDepth: 1, maxNodes: 4 });
    expect(Object.keys(result!.nodes).length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// shortestPath()
// ---------------------------------------------------------------------------

describe("shortestPath()", () => {
  it("returns null when source is unknown", () => {
    const { query } = buildQuery([]);
    expect(query.shortestPath("ghost", "n1")).toBeNull();
  });

  it("returns null when target is unknown", () => {
    const n = makeNode({ id: "n1" });
    const { query } = buildQuery([n]);
    expect(query.shortestPath("n1", "ghost")).toBeNull();
  });

  it("returns single-node path when source === target", () => {
    const n = makeNode({ id: "n1" });
    const { query } = buildQuery([n]);
    const path = query.shortestPath("n1", "n1");
    expect(path).not.toBeNull();
    expect(path!.nodeIds).toEqual(["n1"]);
    expect(path!.edgeIds).toHaveLength(0);
  });

  it("finds direct one-hop path", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const { query } = buildQuery([n1, n2], [e]);
    const path = query.shortestPath("n1", "n2");
    expect(path).not.toBeNull();
    expect(path!.nodeIds).toEqual(["n1", "n2"]);
    expect(path!.edgeIds).toEqual(["e1"]);
  });

  it("finds multi-hop path", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    const path = query.shortestPath("n1", "n3");
    expect(path!.nodeIds).toEqual(["n1", "n2", "n3"]);
  });

  it("returns null when no path exists", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const { query } = buildQuery([n1, n2]); // no edges
    expect(query.shortestPath("n1", "n2")).toBeNull();
  });

  it("returns shortest path when multiple routes exist", () => {
    // n1 → n2 → n3 (2 hops)
    // n1 → n3      (1 hop — should win)
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
      makeEdge({ id: "e3", sourceId: "n1", targetId: "n3" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    const path = query.shortestPath("n1", "n3");
    expect(path!.nodeIds).toHaveLength(2); // direct hop
    expect(path!.nodeIds).toEqual(["n1", "n3"]);
  });
});

// ---------------------------------------------------------------------------
// allPaths()
// ---------------------------------------------------------------------------

describe("allPaths()", () => {
  it("returns empty array when no path exists", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const { query } = buildQuery([n1, n2]);
    expect(query.allPaths("n1", "n2")).toHaveLength(0);
  });

  it("finds both direct and indirect paths", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
      makeEdge({ id: "e3", sourceId: "n1", targetId: "n3" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    const paths = query.allPaths("n1", "n3");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("returns paths sorted shortest first", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
      makeEdge({ id: "e3", sourceId: "n1", targetId: "n3" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    const paths = query.allPaths("n1", "n3");
    expect(paths[0]!.nodeIds.length).toBeLessThanOrEqual(paths[paths.length - 1]!.nodeIds.length);
  });
});

// ---------------------------------------------------------------------------
// detectCycles()
// ---------------------------------------------------------------------------

describe("detectCycles()", () => {
  it("returns empty array for a node with no outgoing edges", () => {
    const n = makeNode({ id: "n1" });
    const { query } = buildQuery([n]);
    expect(query.detectCycles("n1")).toHaveLength(0);
  });

  it("returns empty array for an unknown node", () => {
    const { query } = buildQuery([]);
    expect(query.detectCycles("ghost")).toHaveLength(0);
  });

  it("detects a direct self-loop", () => {
    const n = makeNode({ id: "n1" });
    const selfLoop = makeEdge({ id: "e1", sourceId: "n1", targetId: "n1" });
    const { query } = buildQuery([n], [selfLoop]);
    const cycles = query.detectCycles("n1");
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("detects a two-node cycle", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n1" }),
    ];
    const { query } = buildQuery([n1, n2], edges);
    const cycles = query.detectCycles("n1");
    expect(cycles.length).toBeGreaterThan(0);
    const cycleIds = cycles[0]!.nodeIds;
    expect(cycleIds[0]).toBe(cycleIds[cycleIds.length - 1]); // first === last
  });

  it("detects a three-node cycle", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
      makeEdge({ id: "e3", sourceId: "n3", targetId: "n1" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    const cycles = query.detectCycles("n1");
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("returns empty array for a pure DAG", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const edges = [
      makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" }),
      makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" }),
    ];
    const { query } = buildQuery([n1, n2, n3], edges);
    expect(query.detectCycles("n1")).toHaveLength(0);
  });
});
