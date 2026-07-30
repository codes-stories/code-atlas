import { describe, it, expect, beforeEach } from "vitest";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import { EdgeKind, NodeKind, RelationshipType, ConditionKind } from "../../src/shared/enums";
import { makeNode, makeEdge, loc, range } from "./fixtures";
import type { GraphNode, GraphEdge } from "../../src/shared/models";

let builder: GraphBuilder;

beforeEach(() => {
  builder = new GraphBuilder();
});

// ---------------------------------------------------------------------------
// empty()
// ---------------------------------------------------------------------------

describe("empty()", () => {
  it("returns a graph with no nodes or edges", () => {
    const g = builder.empty("/workspace");
    expect(Object.keys(g.nodes)).toHaveLength(0);
    expect(Object.keys(g.edges)).toHaveLength(0);
  });

  it("sets the correct workspaceRoot", () => {
    const g = builder.empty("/my/project");
    expect(g.workspaceRoot).toBe("/my/project");
  });

  it("sets empty languages array", () => {
    expect(builder.empty("/ws").languages).toEqual([]);
  });

  it("has a non-empty stable id", () => {
    const g = builder.empty("/ws");
    expect(typeof g.id).toBe("string");
    expect(g.id.length).toBeGreaterThan(0);
  });

  it("generates a new id on each call", () => {
    const a = builder.empty("/ws");
    const b = builder.empty("/ws");
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// build() — basic structure
// ---------------------------------------------------------------------------

describe("build() — basic structure", () => {
  it("indexes nodes by id", () => {
    const n = makeNode({ id: "n1" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n], edges: [], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n1"]).toBeDefined();
  });

  it("indexes edges by id", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2], edges: [e], fileCount: 1, parseTimeMs: 0 });
    expect(g.edges["e1"]).toBeDefined();
  });

  it("sets workspaceRoot", () => {
    const g = builder.build({ workspaceRoot: "/root", nodes: [], edges: [], fileCount: 0, parseTimeMs: 0 });
    expect(g.workspaceRoot).toBe("/root");
  });

  it("preserves fileCount", () => {
    const g = builder.build({ workspaceRoot: "/ws", nodes: [], edges: [], fileCount: 42, parseTimeMs: 5 });
    expect(g.fileCount).toBe(42);
  });

  it("generates a unique id on each build", () => {
    const a = builder.build({ workspaceRoot: "/ws", nodes: [], edges: [], fileCount: 0, parseTimeMs: 0 });
    const b = builder.build({ workspaceRoot: "/ws", nodes: [], edges: [], fileCount: 0, parseTimeMs: 0 });
    expect(a.id).not.toBe(b.id);
  });

  it("last-write-wins on duplicate node ids", () => {
    const n1a = makeNode({ id: "n1", displayName: "first" });
    const n1b = makeNode({ id: "n1", displayName: "second" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1a, n1b], edges: [], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n1"]?.displayName).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// build() — edge wiring
// ---------------------------------------------------------------------------

describe("build() — edge wiring", () => {
  it("adds outgoing edge id to source node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2], edges: [e], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n1"]?.outgoingEdgeIds).toContain("e1");
  });

  it("adds incoming edge id to target node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2], edges: [e], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n2"]?.incomingEdgeIds).toContain("e1");
  });

  it("accumulates multiple outgoing edges on one node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const e1 = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const e2 = makeEdge({ id: "e2", sourceId: "n1", targetId: "n3" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2, n3], edges: [e1, e2], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n1"]?.outgoingEdgeIds).toHaveLength(2);
    expect(g.nodes["n1"]?.outgoingEdgeIds).toContain("e1");
    expect(g.nodes["n1"]?.outgoingEdgeIds).toContain("e2");
  });

  it("accumulates multiple incoming edges on one node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const e1 = makeEdge({ id: "e1", sourceId: "n1", targetId: "n3" });
    const e2 = makeEdge({ id: "e2", sourceId: "n2", targetId: "n3" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2, n3], edges: [e1, e2], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["n3"]?.incomingEdgeIds).toHaveLength(2);
  });

  it("isolated nodes have empty edge arrays", () => {
    const n = makeNode({ id: "isolated" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n], edges: [], fileCount: 1, parseTimeMs: 0 });
    expect(g.nodes["isolated"]?.outgoingEdgeIds).toHaveLength(0);
    expect(g.nodes["isolated"]?.incomingEdgeIds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// build() — dangling edge handling
// ---------------------------------------------------------------------------

describe("build() — dangling edge handling", () => {
  it("drops an edge whose source node is missing", () => {
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "MISSING", targetId: "n2" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n2], edges: [e], fileCount: 1, parseTimeMs: 0 });
    expect(g.edges["e1"]).toBeUndefined();
  });

  it("drops an edge whose target node is missing", () => {
    const n1 = makeNode({ id: "n1" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "MISSING" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1], edges: [e], fileCount: 1, parseTimeMs: 0 });
    expect(g.edges["e1"]).toBeUndefined();
  });

  it("keeps valid edges when mixed with dangling ones", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const good = makeEdge({ id: "good", sourceId: "n1", targetId: "n2" });
    const bad = makeEdge({ id: "bad", sourceId: "n1", targetId: "MISSING" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2], edges: [good, bad], fileCount: 1, parseTimeMs: 0 });
    expect(g.edges["good"]).toBeDefined();
    expect(g.edges["bad"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// build() — language collection
// ---------------------------------------------------------------------------

describe("build() — language collection", () => {
  it("collects unique languages from all nodes", () => {
    const n1 = makeNode({ id: "n1", language: "erlang" });
    const n2 = makeNode({ id: "n2", language: "go" });
    const n3 = makeNode({ id: "n3", language: "erlang" });
    const g = builder.build({ workspaceRoot: "/ws", nodes: [n1, n2, n3], edges: [], fileCount: 3, parseTimeMs: 0 });
    expect(g.languages).toHaveLength(2);
    expect(g.languages).toContain("erlang");
    expect(g.languages).toContain("go");
  });

  it("returns languages sorted alphabetically", () => {
    const nodes = ["rust", "go", "erlang"].map((lang, i) => makeNode({ id: `n${i}`, language: lang }));
    const g = builder.build({ workspaceRoot: "/ws", nodes, edges: [], fileCount: 3, parseTimeMs: 0 });
    expect(g.languages).toEqual(["erlang", "go", "rust"]);
  });

  it("returns empty array when no nodes present", () => {
    const g = builder.build({ workspaceRoot: "/ws", nodes: [], edges: [], fileCount: 0, parseTimeMs: 0 });
    expect(g.languages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// build() — parseTimeMs accumulation
// ---------------------------------------------------------------------------

describe("build() — parseTimeMs", () => {
  it("preserves provided parseTimeMs (plus build overhead)", () => {
    const g = builder.build({ workspaceRoot: "/ws", nodes: [], edges: [], fileCount: 0, parseTimeMs: 100 });
    // Build adds a small overhead, so result >= 100.
    expect(g.parseTimeMs).toBeGreaterThanOrEqual(100);
  });
});
