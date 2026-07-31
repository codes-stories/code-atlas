import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";
import { ErlangParser } from "../../src/extension/parsers/ErlangParser";
import { TreeSitterLoader } from "../../src/extension/parsers/TreeSitterLoader";
import { NodeKind, EdgeKind } from "../../src/shared/enums";

// ---------------------------------------------------------------------------
// Setup — one shared loader and parser instance for all tests
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(__dirname, "../../fixtures/sample-workspace");
const GRAMMAR_DIR = path.resolve(__dirname, "../../grammars");
const FIXTURES_DIR = path.join(WORKSPACE_ROOT, "src");

let parser: ErlangParser;
let loader: TreeSitterLoader;

beforeAll(async () => {
  loader = new TreeSitterLoader();
  const wasmDir = path.resolve(
    __dirname,
    "../../node_modules/web-tree-sitter",
  );
  await loader.init(wasmDir);
  parser = new ErlangParser(WORKSPACE_ROOT, loader, GRAMMAR_DIR);
}, 30_000); // allow time for WASM init

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseFixture(fileName: string) {
  const filePath = path.join(FIXTURES_DIR, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return parser.parseFile({ filePath, content });
}

// ---------------------------------------------------------------------------
// ErlangParser.language() / supports()
// ---------------------------------------------------------------------------

describe("language() and supports()", () => {
  it("returns 'erlang'", () => {
    expect(parser.language()).toBe("erlang");
  });

  it("supports .erl files", () => {
    expect(parser.supports("/some/path/module.erl")).toBe(true);
  });

  it("supports .hrl header files", () => {
    expect(parser.supports("/some/path/header.hrl")).toBe(true);
  });

  it("does not support .go files", () => {
    expect(parser.supports("/some/path/main.go")).toBe(false);
  });

  it("does not support .py files", () => {
    expect(parser.supports("/some/path/app.py")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseFile() — math_utils.erl (simple local calls)
// ---------------------------------------------------------------------------

describe("parseFile() — math_utils.erl", () => {
  it("extracts the module node", async () => {
    const graph = await parseFixture("math_utils.erl");
    const modules = Object.values(graph.nodes).filter(
      (n) => n.kind === NodeKind.Module,
    );
    expect(modules).toHaveLength(1);
    expect(modules[0]!.displayName).toBe("math_utils");
  });

  it("extracts function nodes", async () => {
    const graph = await parseFixture("math_utils.erl");
    const funcs = Object.values(graph.nodes).filter(
      (n) => n.kind === NodeKind.Function,
    );
    expect(funcs.length).toBeGreaterThanOrEqual(3);
    const names = funcs.map((f) => f.displayName);
    expect(names).toContain("factorial");
    expect(names).toContain("fibonacci");
    expect(names).toContain("sum");
  });

  it("assigns correct module to function nodes", async () => {
    const graph = await parseFixture("math_utils.erl");
    const funcs = Object.values(graph.nodes).filter(
      (n) => n.kind === NodeKind.Function,
    );
    for (const f of funcs) {
      expect(f.module).toBe("math_utils");
    }
  });

  it("assigns correct language to all nodes", async () => {
    const graph = await parseFixture("math_utils.erl");
    for (const node of Object.values(graph.nodes)) {
      expect(node.language).toBe("erlang");
    }
  });

  it("extracts local call edges for factorial (recursive)", async () => {
    const graph = await parseFixture("math_utils.erl");
    const factNode = Object.values(graph.nodes).find(
      (n) => n.kind === NodeKind.Function && n.displayName === "factorial",
    );
    expect(factNode).toBeDefined();
    // factorial calls itself recursively — at least one outgoing call edge
    const outgoing = Object.values(graph.edges).filter(
      (e) => e.sourceId === factNode!.id && e.kind === EdgeKind.Call,
    );
    expect(outgoing.length).toBeGreaterThanOrEqual(1);
  });

  it("sets 1-based line numbers on function nodes", async () => {
    const graph = await parseFixture("math_utils.erl");
    for (const node of Object.values(graph.nodes)) {
      expect(node.location.line).toBeGreaterThan(0);
      expect(node.location.column).toBeGreaterThan(0);
    }
  });

  it("computes cyclomatic complexity >= 1 for all functions", async () => {
    const graph = await parseFixture("math_utils.erl");
    const funcs = Object.values(graph.nodes).filter(
      (n) => n.kind === NodeKind.Function,
    );
    for (const f of funcs) {
      expect(f.complexity.cyclomatic).toBeGreaterThanOrEqual(1);
    }
  });

  it("sets file path on every node location", async () => {
    const filePath = path.join(FIXTURES_DIR, "math_utils.erl");
    const content = await fs.readFile(filePath, "utf8");
    const graph = await parser.parseFile({ filePath, content });
    for (const node of Object.values(graph.nodes)) {
      expect(node.location.file).toBe(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// parseFile() — kv_store.erl (gen_server)
// ---------------------------------------------------------------------------

describe("parseFile() — kv_store.erl", () => {
  it("extracts the kv_store module node", async () => {
    const graph = await parseFixture("kv_store.erl");
    const mod = Object.values(graph.nodes).find(
      (n) => n.kind === NodeKind.Module && n.displayName === "kv_store",
    );
    expect(mod).toBeDefined();
  });

  it("extracts gen_server callback functions", async () => {
    const graph = await parseFixture("kv_store.erl");
    const names = Object.values(graph.nodes)
      .filter((n) => n.kind === NodeKind.Function)
      .map((n) => n.displayName);
    expect(names).toContain("init");
    expect(names).toContain("handle_call");
    expect(names).toContain("handle_cast");
    expect(names).toContain("handle_info");
    expect(names).toContain("terminate");
  });

  it("extracts public API functions", async () => {
    const graph = await parseFixture("kv_store.erl");
    const names = Object.values(graph.nodes)
      .filter((n) => n.kind === NodeKind.Function)
      .map((n) => n.displayName);
    expect(names).toContain("start_link");
    expect(names).toContain("get");
    expect(names).toContain("put");
    expect(names).toContain("delete");
  });

  it("returns fileCount of 1", async () => {
    const graph = await parseFixture("kv_store.erl");
    expect(graph.fileCount).toBe(1);
  });

  it("includes 'erlang' in the graph languages", async () => {
    const graph = await parseFixture("kv_store.erl");
    expect(graph.languages).toContain("erlang");
  });
});

// ---------------------------------------------------------------------------
// parseFile() — kv_sup.erl (supervisor)
// ---------------------------------------------------------------------------

describe("parseFile() — kv_sup.erl", () => {
  it("extracts the kv_sup module node", async () => {
    const graph = await parseFixture("kv_sup.erl");
    const mod = Object.values(graph.nodes).find(
      (n) => n.kind === NodeKind.Module && n.displayName === "kv_sup",
    );
    expect(mod).toBeDefined();
  });

  it("extracts start_link and init functions", async () => {
    const graph = await parseFixture("kv_sup.erl");
    const names = Object.values(graph.nodes)
      .filter((n) => n.kind === NodeKind.Function)
      .map((n) => n.displayName);
    expect(names).toContain("start_link");
    expect(names).toContain("init");
  });
});

// ---------------------------------------------------------------------------
// parseFile() — empty / invalid content
// ---------------------------------------------------------------------------

describe("parseFile() — edge cases", () => {
  it("returns an empty graph for an empty file", async () => {
    const graph = await parser.parseFile({
      filePath: "/fake/empty.erl",
      content: "",
    });
    expect(Object.keys(graph.nodes)).toHaveLength(0);
    expect(Object.keys(graph.edges)).toHaveLength(0);
  });

  it("returns an empty graph for a file with only comments", async () => {
    const graph = await parser.parseFile({
      filePath: "/fake/comments.erl",
      content: "%% This is just a comment\n%% Nothing here\n",
    });
    expect(Object.keys(graph.nodes)).toHaveLength(0);
  });

  it("does not throw on syntactically invalid Erlang", async () => {
    await expect(
      parser.parseFile({
        filePath: "/fake/broken.erl",
        content: "-module(broken\n%% unclosed",
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getDefinitions()
// ---------------------------------------------------------------------------

describe("getDefinitions()", () => {
  it("finds a function by name", async () => {
    const filePath = path.join(FIXTURES_DIR, "math_utils.erl");
    const defs = await parser.getDefinitions(filePath, "factorial");
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs[0]!.node.displayName).toBe("factorial");
  });

  it("returns empty array for unknown symbol", async () => {
    const filePath = path.join(FIXTURES_DIR, "math_utils.erl");
    const defs = await parser.getDefinitions(filePath, "nonexistent_func");
    expect(defs).toHaveLength(0);
  });

  it("returns empty array for non-existent file", async () => {
    const defs = await parser.getDefinitions("/does/not/exist.erl", "foo");
    expect(defs).toHaveLength(0);
  });
});
