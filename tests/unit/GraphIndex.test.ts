import { describe, it, expect, beforeEach } from "vitest";
import { GraphIndex } from "../../src/extension/graph/GraphIndex";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import { NodeKind, EdgeKind } from "../../src/shared/enums";
import { makeNode, makeEdge, loc, makeGraph } from "./fixtures";
import type { CodeGraph } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIndex(nodes: ReturnType<typeof makeNode>[], edges: ReturnType<typeof makeEdge>[] = []): GraphIndex {
  const builder = new GraphBuilder();
  const graph = builder.build({
    workspaceRoot: "/workspace",
    nodes,
    edges,
    fileCount: nodes.length,
    parseTimeMs: 0,
  });
  return new GraphIndex(graph);
}

// ---------------------------------------------------------------------------
// nodesInFile()
// ---------------------------------------------------------------------------

describe("nodesInFile()", () => {
  it("returns ids of all nodes in the given file", () => {
    const n1 = makeNode({ id: "n1", location: loc("/workspace/a.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/workspace/a.erl") });
    const n3 = makeNode({ id: "n3", location: loc("/workspace/b.erl") });
    const idx = buildIndex([n1, n2, n3]);
    expect(idx.nodesInFile("/workspace/a.erl")).toHaveLength(2);
    expect(idx.nodesInFile("/workspace/a.erl")).toContain("n1");
    expect(idx.nodesInFile("/workspace/a.erl")).toContain("n2");
  });

  it("returns empty array for an unknown file", () => {
    const idx = buildIndex([]);
    expect(idx.nodesInFile("/unknown.erl")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nodesInModule()
// ---------------------------------------------------------------------------

describe("nodesInModule()", () => {
  it("returns ids of nodes belonging to a module", () => {
    const n1 = makeNode({ id: "n1", module: "my_mod" });
    const n2 = makeNode({ id: "n2", module: "other_mod" });
    const n3 = makeNode({ id: "n3", module: "my_mod" });
    const idx = buildIndex([n1, n2, n3]);
    const result = idx.nodesInModule("my_mod");
    expect(result).toHaveLength(2);
    expect(result).toContain("n1");
    expect(result).toContain("n3");
  });

  it("returns empty array for unknown module", () => {
    const idx = buildIndex([]);
    expect(idx.nodesInModule("ghost")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nodesOfKind()
// ---------------------------------------------------------------------------

describe("nodesOfKind()", () => {
  it("returns only nodes of the requested kind", () => {
    const f1 = makeNode({ id: "f1", kind: NodeKind.Function });
    const f2 = makeNode({ id: "f2", kind: NodeKind.Function });
    const c1 = makeNode({ id: "c1", kind: NodeKind.Class });
    const idx = buildIndex([f1, f2, c1]);
    expect(idx.nodesOfKind(NodeKind.Function)).toHaveLength(2);
    expect(idx.nodesOfKind(NodeKind.Class)).toHaveLength(1);
    expect(idx.nodesOfKind(NodeKind.Module)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nodesForLanguage()
// ---------------------------------------------------------------------------

describe("nodesForLanguage()", () => {
  it("returns only nodes for the requested language", () => {
    const e1 = makeNode({ id: "e1", language: "erlang" });
    const g1 = makeNode({ id: "g1", language: "go" });
    const e2 = makeNode({ id: "e2", language: "erlang" });
    const idx = buildIndex([e1, g1, e2]);
    expect(idx.nodesForLanguage("erlang")).toHaveLength(2);
    expect(idx.nodesForLanguage("go")).toHaveLength(1);
    expect(idx.nodesForLanguage("rust")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// searchByName()
// ---------------------------------------------------------------------------

describe("searchByName()", () => {
  it("returns nodes matching the substring (case-insensitive)", () => {
    const n1 = makeNode({ id: "n1", displayName: "handle_call" });
    const n2 = makeNode({ id: "n2", displayName: "handle_cast" });
    const n3 = makeNode({ id: "n3", displayName: "init" });
    const idx = buildIndex([n1, n2, n3]);
    const results = idx.searchByName("handle");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain("n1");
    expect(results.map((r) => r.id)).toContain("n2");
  });

  it("is case-insensitive", () => {
    const n = makeNode({ id: "n1", displayName: "HandleCall" });
    const idx = buildIndex([n]);
    expect(idx.searchByName("handlecall")).toHaveLength(1);
    expect(idx.searchByName("HANDLECALL")).toHaveLength(1);
  });

  it("returns empty array when no match", () => {
    const idx = buildIndex([makeNode({ id: "n1", displayName: "foo" })]);
    expect(idx.searchByName("zzz")).toHaveLength(0);
  });

  it("respects the limit parameter", () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({ id: `n${i}`, displayName: `foo_${i}` }),
    );
    const idx = buildIndex(nodes);
    expect(idx.searchByName("foo", 5)).toHaveLength(5);
  });

  it("returns results sorted alphabetically by displayName", () => {
    const n1 = makeNode({ id: "n1", displayName: "z_func" });
    const n2 = makeNode({ id: "n2", displayName: "a_func" });
    const n3 = makeNode({ id: "n3", displayName: "m_func" });
    const idx = buildIndex([n1, n2, n3]);
    const names = idx.searchByName("func").map((r) => r.displayName);
    expect(names).toEqual(["a_func", "m_func", "z_func"]);
  });

  it("nodeRef contains expected fields", () => {
    const n = makeNode({ id: "n1", displayName: "my_fun", language: "erlang", kind: NodeKind.Function });
    const idx = buildIndex([n]);
    const ref = idx.searchByName("my_fun")[0];
    expect(ref).toBeDefined();
    expect(ref!.id).toBe("n1");
    expect(ref!.displayName).toBe("my_fun");
    expect(ref!.language).toBe("erlang");
    expect(ref!.kind).toBe(NodeKind.Function);
  });
});

// ---------------------------------------------------------------------------
// outgoingEdges() / incomingEdges()
// ---------------------------------------------------------------------------

describe("outgoingEdges() / incomingEdges()", () => {
  it("returns outgoing edges for a node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const idx = buildIndex([n1, n2], [e]);
    const out = idx.outgoingEdges("n1");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("e1");
  });

  it("returns incoming edges for a node", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const idx = buildIndex([n1, n2], [e]);
    const inc = idx.incomingEdges("n2");
    expect(inc).toHaveLength(1);
    expect(inc[0]!.id).toBe("e1");
  });

  it("returns empty arrays for a node with no edges", () => {
    const n = makeNode({ id: "lonely" });
    const idx = buildIndex([n]);
    expect(idx.outgoingEdges("lonely")).toHaveLength(0);
    expect(idx.incomingEdges("lonely")).toHaveLength(0);
  });

  it("returns empty arrays for an unknown node id", () => {
    const idx = buildIndex([]);
    expect(idx.outgoingEdges("ghost")).toHaveLength(0);
    expect(idx.incomingEdges("ghost")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// edgesOfKind()
// ---------------------------------------------------------------------------

describe("edgesOfKind()", () => {
  it("returns edge ids of the requested kind", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const callEdge = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2", kind: EdgeKind.Call });
    const spawnEdge = makeEdge({ id: "e2", sourceId: "n1", targetId: "n3", kind: EdgeKind.Spawn });
    const idx = buildIndex([n1, n2, n3], [callEdge, spawnEdge]);
    expect(idx.edgesOfKind(EdgeKind.Call)).toContain("e1");
    expect(idx.edgesOfKind(EdgeKind.Spawn)).toContain("e2");
    expect(idx.edgesOfKind(EdgeKind.Async)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// allFiles() / allModules() / allLanguages()
// ---------------------------------------------------------------------------

describe("allFiles()", () => {
  it("returns sorted unique file paths", () => {
    const n1 = makeNode({ id: "n1", location: loc("/z.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/a.erl") });
    const n3 = makeNode({ id: "n3", location: loc("/a.erl") });
    const idx = buildIndex([n1, n2, n3]);
    expect(idx.allFiles()).toEqual(["/a.erl", "/z.erl"]);
  });
});

describe("allModules()", () => {
  it("returns sorted unique module strings", () => {
    const n1 = makeNode({ id: "n1", module: "z_mod" });
    const n2 = makeNode({ id: "n2", module: "a_mod" });
    const idx = buildIndex([n1, n2]);
    expect(idx.allModules()).toEqual(["a_mod", "z_mod"]);
  });
});

describe("allLanguages()", () => {
  it("reflects graph.languages", () => {
    const n1 = makeNode({ id: "n1", language: "erlang" });
    const n2 = makeNode({ id: "n2", language: "go" });
    const idx = buildIndex([n1, n2]);
    expect(idx.allLanguages()).toContain("erlang");
    expect(idx.allLanguages()).toContain("go");
  });
});

// ---------------------------------------------------------------------------
// searchByName() — cache behaviour
// ---------------------------------------------------------------------------

describe("searchByName() cache", () => {
  it("caches search results for repeated identical queries", () => {
    const n1 = makeNode({ id: "n1", displayName: "handle_call" });
    const n2 = makeNode({ id: "n2", displayName: "handle_cast" });
    const n3 = makeNode({ id: "n3", displayName: "init" });
    const idx = buildIndex([n1, n2, n3]);

    // Call twice with the same arguments
    const first  = idx.searchByName("handle");
    const second = idx.searchByName("handle");

    // Both calls should return results with the same content
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first.map((r) => r.id).sort()).toEqual(second.map((r) => r.id).sort());
  });

  it("returns same reference for cached results", () => {
    const n1 = makeNode({ id: "n1", displayName: "start_link" });
    const idx = buildIndex([n1]);

    // The exact same array reference should be returned on the second call
    const first  = idx.searchByName("start");
    const second = idx.searchByName("start");

    expect(first).toBe(second);
  });

  it("cache is per-instance (new GraphIndex has empty cache)", () => {
    const n1 = makeNode({ id: "n1", displayName: "init" });
    const n2 = makeNode({ id: "n2", displayName: "init_state" });

    const idx1 = buildIndex([n1, n2]);
    // Prime the cache on idx1
    const cached = idx1.searchByName("init");
    expect(cached).toHaveLength(2);

    // A fresh index has its own empty cache — the result is independently
    // computed but must match the same content
    const idx2 = buildIndex([n1, n2]);
    const fresh = idx2.searchByName("init");
    expect(fresh).toHaveLength(2);

    // They are distinct array instances because they come from different objects
    expect(fresh).not.toBe(cached);
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe("stats", () => {
  it("nodeCount matches the graph node count", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" }), makeNode({ id: "n3" })];
    const idx = buildIndex(nodes);
    expect(idx.nodeCount).toBe(3);
  });

  it("edgeCount matches the graph edge count", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const idx = buildIndex([n1, n2], [e]);
    expect(idx.edgeCount).toBe(1);
  });

  it("fileCount matches the number of distinct files", () => {
    const n1 = makeNode({ id: "n1", location: loc("/a.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/a.erl") });
    const n3 = makeNode({ id: "n3", location: loc("/b.erl") });
    const idx = buildIndex([n1, n2, n3]);
    expect(idx.fileCount).toBe(2);
  });
});
