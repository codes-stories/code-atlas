import { describe, it, expect } from "vitest";
import { NodeIdGenerator } from "../../src/extension/parsers/NodeIdGenerator";

const ROOT = "/workspace";

function gen(overrides?: Partial<{
  language: string;
  filePath: string;
  module: string;
  symbolName: string;
  line: number;
  column: number;
}>) {
  const g = new NodeIdGenerator(ROOT);
  return g.generate(
    overrides?.language ?? "erlang",
    overrides?.filePath ?? "/workspace/src/foo.erl",
    overrides?.module ?? "foo",
    overrides?.symbolName ?? "bar",
    overrides?.line ?? 10,
    overrides?.column ?? 1,
  );
}

// ---------------------------------------------------------------------------
// Stability
// ---------------------------------------------------------------------------

describe("generate() — stability", () => {
  it("returns the same id for identical inputs", () => {
    const g = new NodeIdGenerator(ROOT);
    const id1 = g.generate("erlang", "/workspace/foo.erl", "foo", "bar", 10, 1);
    const id2 = g.generate("erlang", "/workspace/foo.erl", "foo", "bar", 10, 1);
    expect(id1).toBe(id2);
  });

  it("two different generators with the same workspaceRoot produce the same id", () => {
    const g1 = new NodeIdGenerator(ROOT);
    const g2 = new NodeIdGenerator(ROOT);
    expect(
      g1.generate("erlang", "/workspace/foo.erl", "foo", "bar", 1, 1),
    ).toBe(
      g2.generate("erlang", "/workspace/foo.erl", "foo", "bar", 1, 1),
    );
  });

  it("returns a 40-character hex string (SHA-1)", () => {
    const id = gen();
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// Uniqueness
// ---------------------------------------------------------------------------

describe("generate() — uniqueness", () => {
  it("differs when filePath differs", () => {
    expect(gen({ filePath: "/workspace/a.erl" })).not.toBe(
      gen({ filePath: "/workspace/b.erl" }),
    );
  });

  it("differs when symbolName differs", () => {
    expect(gen({ symbolName: "foo" })).not.toBe(gen({ symbolName: "bar" }));
  });

  it("differs when line differs", () => {
    expect(gen({ line: 1 })).not.toBe(gen({ line: 2 }));
  });

  it("differs when column differs", () => {
    expect(gen({ column: 1 })).not.toBe(gen({ column: 5 }));
  });

  it("differs when module differs", () => {
    expect(gen({ module: "mod_a" })).not.toBe(gen({ module: "mod_b" }));
  });

  it("differs when language differs", () => {
    expect(gen({ language: "erlang" })).not.toBe(gen({ language: "go" }));
  });

  it("differs when workspaceRoot differs", () => {
    const g1 = new NodeIdGenerator("/workspace/project_a");
    const g2 = new NodeIdGenerator("/workspace/project_b");
    const id1 = g1.generate("erlang", "/workspace/project_a/foo.erl", "foo", "bar", 1, 1);
    const id2 = g2.generate("erlang", "/workspace/project_b/foo.erl", "foo", "bar", 1, 1);
    expect(id1).not.toBe(id2);
  });

  it("same name at different lines produces different ids", () => {
    const g = new NodeIdGenerator(ROOT);
    const ids = [1, 5, 10, 100].map((line) =>
      g.generate("erlang", "/workspace/foo.erl", "mod", "init", line, 1),
    );
    const unique = new Set(ids);
    expect(unique.size).toBe(4);
  });

  it("empty module string is distinct from non-empty", () => {
    expect(gen({ module: "" })).not.toBe(gen({ module: "some_module" }));
  });
});

// ---------------------------------------------------------------------------
// generateEdgeId()
// ---------------------------------------------------------------------------

describe("generateEdgeId() — stability", () => {
  it("same inputs produce the same edge id", () => {
    const g = new NodeIdGenerator(ROOT);
    const id1 = g.generateEdgeId("src-node", "tgt-node", "function_call", 42);
    const id2 = g.generateEdgeId("src-node", "tgt-node", "function_call", 42);
    expect(id1).toBe(id2);
  });

  it("returns a 40-character hex string", () => {
    const g = new NodeIdGenerator(ROOT);
    expect(g.generateEdgeId("a", "b", "call", 1)).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("generateEdgeId() — uniqueness", () => {
  it("differs when sourceNodeId differs", () => {
    const g = new NodeIdGenerator(ROOT);
    expect(g.generateEdgeId("src-a", "tgt", "call", 1)).not.toBe(
      g.generateEdgeId("src-b", "tgt", "call", 1),
    );
  });

  it("differs when targetNodeId differs", () => {
    const g = new NodeIdGenerator(ROOT);
    expect(g.generateEdgeId("src", "tgt-a", "call", 1)).not.toBe(
      g.generateEdgeId("src", "tgt-b", "call", 1),
    );
  });

  it("differs when relationshipType differs", () => {
    const g = new NodeIdGenerator(ROOT);
    expect(g.generateEdgeId("src", "tgt", "call", 1)).not.toBe(
      g.generateEdgeId("src", "tgt", "spawn", 1),
    );
  });

  it("differs when callSiteLine differs", () => {
    const g = new NodeIdGenerator(ROOT);
    expect(g.generateEdgeId("src", "tgt", "call", 1)).not.toBe(
      g.generateEdgeId("src", "tgt", "call", 2),
    );
  });

  it("node id and edge id for the same inputs are different", () => {
    const g = new NodeIdGenerator(ROOT);
    const nodeId = g.generate("erlang", "/workspace/foo.erl", "mod", "bar", 1, 1);
    const edgeId = g.generateEdgeId(nodeId, nodeId, "call", 1);
    expect(nodeId).not.toBe(edgeId);
  });
});
