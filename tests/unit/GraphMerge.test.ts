import { describe, it, expect, beforeEach } from "vitest";
import { GraphMerge } from "../../src/extension/graph/GraphMerge";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import { makeNode, makeEdge, loc, makeGraph } from "./fixtures";
import type { CodeGraph } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

let merger: GraphMerge;
let builder: GraphBuilder;

beforeEach(() => {
  merger = new GraphMerge();
  builder = new GraphBuilder();
});

function buildGraph(
  nodes: ReturnType<typeof makeNode>[],
  edges: ReturnType<typeof makeEdge>[] = [],
  workspaceRoot = "/workspace",
): CodeGraph {
  return builder.build({
    workspaceRoot,
    nodes,
    edges,
    fileCount: nodes.length,
    parseTimeMs: 0,
  });
}

function emptyPatch(workspaceRoot = "/workspace"): CodeGraph {
  return builder.empty(workspaceRoot);
}

// ---------------------------------------------------------------------------
// applyFilePatch() — adding new nodes
// ---------------------------------------------------------------------------

describe("applyFilePatch() — adding new nodes", () => {
  it("adds nodes from the patch to the graph", () => {
    const base = buildGraph([makeNode({ id: "existing", location: loc("/workspace/a.erl") })]);
    const newNode = makeNode({ id: "fresh", location: loc("/workspace/b.erl") });
    const patch = buildGraph([newNode]);

    const result = merger.applyFilePatch(base, { filePath: "/workspace/b.erl", patch });
    expect(result.nodes["existing"]).toBeDefined();
    expect(result.nodes["fresh"]).toBeDefined();
  });

  it("increments fileCount when a new file is added", () => {
    const base = buildGraph([makeNode({ id: "n1", location: loc("/a.erl") })]);
    const newNode = makeNode({ id: "n2", location: loc("/b.erl") });
    const patch = buildGraph([newNode]);

    const result = merger.applyFilePatch(base, { filePath: "/b.erl", patch });
    expect(result.fileCount).toBe(base.fileCount + 1);
  });
});

// ---------------------------------------------------------------------------
// applyFilePatch() — replacing stale nodes
// ---------------------------------------------------------------------------

describe("applyFilePatch() — replacing stale nodes", () => {
  it("removes stale nodes from the patched file", () => {
    const stale = makeNode({ id: "stale", location: loc("/workspace/a.erl") });
    const base = buildGraph([stale]);

    const fresh = makeNode({ id: "fresh", location: loc("/workspace/a.erl") });
    const patch = buildGraph([fresh]);

    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });
    expect(result.nodes["stale"]).toBeUndefined();
    expect(result.nodes["fresh"]).toBeDefined();
  });

  it("does not remove nodes from other files", () => {
    const keeper = makeNode({ id: "keeper", location: loc("/workspace/b.erl") });
    const stale = makeNode({ id: "stale", location: loc("/workspace/a.erl") });
    const base = buildGraph([keeper, stale]);

    const patch = buildGraph([makeNode({ id: "replacement", location: loc("/workspace/a.erl") })]);
    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });

    expect(result.nodes["keeper"]).toBeDefined();
    expect(result.nodes["stale"]).toBeUndefined();
  });

  it("does not change fileCount when replacing nodes in an existing file", () => {
    const stale = makeNode({ id: "stale", location: loc("/workspace/a.erl") });
    const base = buildGraph([stale]);
    const fresh = makeNode({ id: "fresh", location: loc("/workspace/a.erl") });
    const patch = buildGraph([fresh]);

    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });
    expect(result.fileCount).toBe(base.fileCount);
  });
});

// ---------------------------------------------------------------------------
// applyFilePatch() — edge pruning
// ---------------------------------------------------------------------------

describe("applyFilePatch() — edge pruning", () => {
  it("removes edges whose source node is in the patched file", () => {
    const src = makeNode({ id: "src", location: loc("/workspace/a.erl") });
    const tgt = makeNode({ id: "tgt", location: loc("/workspace/b.erl") });
    const staleEdge = makeEdge({ id: "stale_edge", sourceId: "src", targetId: "tgt" });
    const base = buildGraph([src, tgt], [staleEdge]);

    // Patch replaces a.erl with no outgoing edges from src.
    const freshSrc = makeNode({ id: "src2", location: loc("/workspace/a.erl") });
    const patch = buildGraph([freshSrc]);

    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });
    expect(result.edges["stale_edge"]).toBeUndefined();
  });

  it("removes edges whose target node is in the patched file", () => {
    const src = makeNode({ id: "src", location: loc("/workspace/b.erl") });
    const tgt = makeNode({ id: "tgt", location: loc("/workspace/a.erl") });
    const staleEdge = makeEdge({ id: "stale_edge", sourceId: "src", targetId: "tgt" });
    const base = buildGraph([src, tgt], [staleEdge]);

    // Patch replaces a.erl.
    const freshTgt = makeNode({ id: "tgt2", location: loc("/workspace/a.erl") });
    const patch = buildGraph([freshTgt]);

    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });
    expect(result.edges["stale_edge"]).toBeUndefined();
  });

  it("preserves edges between nodes in unaffected files", () => {
    const n1 = makeNode({ id: "n1", location: loc("/workspace/b.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/workspace/c.erl") });
    const keepEdge = makeEdge({ id: "keep", sourceId: "n1", targetId: "n2" });
    const base = buildGraph([n1, n2], [keepEdge]);

    // Patch only touches a.erl.
    const patch = buildGraph([makeNode({ id: "n3", location: loc("/workspace/a.erl") })]);
    const result = merger.applyFilePatch(base, { filePath: "/workspace/a.erl", patch });

    expect(result.edges["keep"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// removeFile()
// ---------------------------------------------------------------------------

describe("removeFile()", () => {
  it("removes all nodes from the given file", () => {
    const n1 = makeNode({ id: "n1", location: loc("/a.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/b.erl") });
    const base = buildGraph([n1, n2]);

    const result = merger.removeFile(base, "/a.erl");
    expect(result.nodes["n1"]).toBeUndefined();
    expect(result.nodes["n2"]).toBeDefined();
  });

  it("decrements fileCount when removing a known file", () => {
    const n = makeNode({ id: "n1", location: loc("/a.erl") });
    const base = buildGraph([n]);

    const result = merger.removeFile(base, "/a.erl");
    expect(result.fileCount).toBe(base.fileCount - 1);
  });

  it("does not go below fileCount of 0", () => {
    const base = builder.empty("/workspace");
    const result = merger.removeFile(base, "/nonexistent.erl");
    expect(result.fileCount).toBe(0);
  });

  it("removes edges connecting to removed nodes", () => {
    const n1 = makeNode({ id: "n1", location: loc("/a.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/b.erl") });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const base = buildGraph([n1, n2], [e]);

    const result = merger.removeFile(base, "/a.erl");
    expect(result.edges["e1"]).toBeUndefined();
  });

  it("is a no-op on fileCount for an unknown file path", () => {
    const base = buildGraph([makeNode({ id: "n1", location: loc("/a.erl") })]);
    const result = merger.removeFile(base, "/does-not-exist.erl");
    expect(result.fileCount).toBe(base.fileCount);
  });
});

// ---------------------------------------------------------------------------
// mergeAll()
// ---------------------------------------------------------------------------

describe("mergeAll()", () => {
  it("combines nodes from all partial graphs", () => {
    const partial1 = buildGraph([makeNode({ id: "n1", location: loc("/a.erl") })]);
    const partial2 = buildGraph([makeNode({ id: "n2", location: loc("/b.erl") })]);

    const result = merger.mergeAll("/workspace", [partial1, partial2]);
    expect(result.nodes["n1"]).toBeDefined();
    expect(result.nodes["n2"]).toBeDefined();
  });

  it("combines edges from all partial graphs", () => {
    const n1 = makeNode({ id: "n1", location: loc("/a.erl") });
    const n2 = makeNode({ id: "n2", location: loc("/b.erl") });
    const e = makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" });
    const partial1 = buildGraph([n1, n2], [e]);

    const result = merger.mergeAll("/workspace", [partial1]);
    expect(result.edges["e1"]).toBeDefined();
  });

  it("returns an empty graph for empty input", () => {
    const result = merger.mergeAll("/workspace", []);
    expect(Object.keys(result.nodes)).toHaveLength(0);
    expect(Object.keys(result.edges)).toHaveLength(0);
  });

  it("sums parseTimeMs across all partials", () => {
    const p1: CodeGraph = { ...buildGraph([]), parseTimeMs: 100 };
    const p2: CodeGraph = { ...buildGraph([]), parseTimeMs: 200 };
    const result = merger.mergeAll("/workspace", [p1, p2]);
    expect(result.parseTimeMs).toBeGreaterThanOrEqual(300);
  });

  it("counts distinct files across all partials", () => {
    const partial1 = buildGraph([
      makeNode({ id: "n1", location: loc("/a.erl") }),
      makeNode({ id: "n2", location: loc("/a.erl") }),
    ]);
    const partial2 = buildGraph([makeNode({ id: "n3", location: loc("/b.erl") })]);

    const result = merger.mergeAll("/workspace", [partial1, partial2]);
    expect(result.fileCount).toBe(2); // /a.erl and /b.erl
  });

  it("last partial wins on duplicate node ids", () => {
    const n_first = makeNode({ id: "dup", displayName: "first", location: loc("/a.erl") });
    const n_last = makeNode({ id: "dup", displayName: "last", location: loc("/a.erl") });
    const partial1 = buildGraph([n_first]);
    const partial2 = buildGraph([n_last]);

    const result = merger.mergeAll("/workspace", [partial1, partial2]);
    expect(result.nodes["dup"]?.displayName).toBe("last");
  });
});
