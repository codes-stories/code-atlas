/**
 * Integration smoke tests — exercises the full GraphService + GraphBuilder +
 * GraphIndex + GraphQuery pipeline against a realistic Erlang-shaped graph.
 *
 * No WASM / tree-sitter required. The graph data simulates exactly what
 * ErlangParser would produce for kv_store.erl + kv_sup.erl + math_utils.erl.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import { GraphService } from "../../src/extension/graph/GraphService";
import { NodeKind, EdgeKind, RelationshipType, ConditionKind } from "../../src/shared/enums";
import type { GraphNode, GraphEdge, CodeGraph } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Constants — mirrors the real fixture file paths
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(__dirname, "../../fixtures/sample-workspace");
const KV_STORE_FILE = path.join(WORKSPACE_ROOT, "src", "kv_store.erl");
const KV_SUP_FILE = path.join(WORKSPACE_ROOT, "src", "kv_sup.erl");
const MATH_UTILS_FILE = path.join(WORKSPACE_ROOT, "src", "math_utils.erl");

// ---------------------------------------------------------------------------
// Minimal Logger stub (GraphService requires a Logger)
// ---------------------------------------------------------------------------

const nullLogger = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// ---------------------------------------------------------------------------
// Node helpers — produce realistic Erlang nodes
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  displayName: string,
  module: string,
  kind: NodeKind,
  file: string,
  line: number,
): GraphNode {
  return {
    id,
    displayName,
    language: "erlang",
    kind,
    module,
    signature: kind === NodeKind.Module ? `-module(${displayName}).` : `${displayName}/${module === "math_utils" ? "1" : "0"}`,
    location: { file, line, column: 1 },
    range: { start: { file, line, column: 1 }, end: { file, line: line + 5, column: 1 } },
    documentation: "",
    complexity: { cyclomatic: 1, cognitive: 0, loc: 6, parameters: 0 },
    incomingEdgeIds: [],
    outgoingEdgeIds: [],
    gitBlame: null,
    metadata: {},
  };
}

function makeEdge(
  id: string,
  sourceId: string,
  targetId: string,
  kind: EdgeKind,
  file: string,
  line: number,
  relType: RelationshipType = RelationshipType.FunctionCall,
): GraphEdge {
  return {
    id,
    sourceId,
    targetId,
    kind,
    relationshipType: relType,
    location: { file, line, column: 1 },
    sourceCode: `${sourceId} -> ${targetId}`,
    reason: "",
    conditionKind: ConditionKind.Unconditional,
    conditionExpression: "",
    examples: [],
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Build the realistic Erlang-shaped graph
//
// Nodes (11 total):
//   kv_store module, kv_store:start_link, kv_store:init,
//   kv_store:handle_call, kv_store:handle_cast, kv_store:terminate,
//   kv_sup module, kv_sup:start_link, kv_sup:init,
//   math_utils module, math_utils:factorial
//
// Edges (9 total):
//   kv_sup:start_link -[spawn]-> kv_store:start_link  (supervisor starts worker)
//   kv_store:start_link -[call]-> kv_store:init        (gen_server init)
//   kv_sup:init -[call]-> kv_store:start_link          (child spec)
//   kv_store:handle_call -[call]-> kv_store:handle_cast (internal delegation)
//   kv_store:terminate -[call]-> kv_store:handle_cast  (cleanup delegation — gives a cycle candidate)
//   kv_sup:start_link -[call]-> kv_sup:init            (supervisor:start_link triggers init)
//   math_utils:factorial -[call]-> math_utils:factorial (self-recursive)
//   kv_store:init -[call]-> kv_store:handle_call       (creates a cycle: init→handle_call→handle_cast)
//   kv_store:handle_cast -[call]-> kv_store:terminate  (stop path)
// ---------------------------------------------------------------------------

function buildErlangGraph(): CodeGraph {
  const builder = new GraphBuilder();

  const nodes: GraphNode[] = [
    // kv_store module
    makeNode("kv_store::module", "kv_store", "kv_store", NodeKind.Module, KV_STORE_FILE, 4),
    makeNode("kv_store::start_link", "start_link", "kv_store", NodeKind.Function, KV_STORE_FILE, 14),
    makeNode("kv_store::init", "init", "kv_store", NodeKind.Function, KV_STORE_FILE, 29),
    makeNode("kv_store::handle_call", "handle_call", "kv_store", NodeKind.Function, KV_STORE_FILE, 33),
    makeNode("kv_store::handle_cast", "handle_cast", "kv_store", NodeKind.Function, KV_STORE_FILE, 40),
    makeNode("kv_store::terminate", "terminate", "kv_store", NodeKind.Function, KV_STORE_FILE, 50),
    // kv_sup module
    makeNode("kv_sup::module", "kv_sup", "kv_sup", NodeKind.Module, KV_SUP_FILE, 4),
    makeNode("kv_sup::start_link", "start_link", "kv_sup", NodeKind.Function, KV_SUP_FILE, 9),
    makeNode("kv_sup::init", "init", "kv_sup", NodeKind.Function, KV_SUP_FILE, 13),
    // math_utils module
    makeNode("math_utils::module", "math_utils", "math_utils", NodeKind.Module, MATH_UTILS_FILE, 4),
    makeNode("math_utils::factorial", "factorial", "math_utils", NodeKind.Function, MATH_UTILS_FILE, 9),
  ];

  const edges: GraphEdge[] = [
    // kv_sup:start_link spawns kv_store:start_link
    makeEdge("e::sup_start_link->store_start_link", "kv_sup::start_link", "kv_store::start_link",
      EdgeKind.Spawn, KV_SUP_FILE, 10, RelationshipType.SpawnLink),
    // kv_store:start_link calls kv_store:init (gen_server bootstrap)
    makeEdge("e::store_start_link->store_init", "kv_store::start_link", "kv_store::init",
      EdgeKind.Call, KV_STORE_FILE, 15),
    // kv_sup:init references kv_store:start_link (child spec)
    makeEdge("e::sup_init->store_start_link", "kv_sup::init", "kv_store::start_link",
      EdgeKind.Call, KV_SUP_FILE, 14),
    // kv_sup:start_link calls kv_sup:init
    makeEdge("e::sup_start_link->sup_init", "kv_sup::start_link", "kv_sup::init",
      EdgeKind.Call, KV_SUP_FILE, 9),
    // kv_store:init calls kv_store:handle_call (creates cycle path)
    makeEdge("e::store_init->store_handle_call", "kv_store::init", "kv_store::handle_call",
      EdgeKind.Call, KV_STORE_FILE, 30),
    // kv_store:handle_call delegates to kv_store:handle_cast
    makeEdge("e::store_handle_call->store_handle_cast", "kv_store::handle_call", "kv_store::handle_cast",
      EdgeKind.Call, KV_STORE_FILE, 35),
    // kv_store:handle_cast calls kv_store:terminate (stop path)
    makeEdge("e::store_handle_cast->store_terminate", "kv_store::handle_cast", "kv_store::terminate",
      EdgeKind.Call, KV_STORE_FILE, 44),
    // kv_store:terminate calls kv_store:handle_call (cycle: handle_call→handle_cast→terminate→handle_call)
    makeEdge("e::store_terminate->store_handle_call", "kv_store::terminate", "kv_store::handle_call",
      EdgeKind.Call, KV_STORE_FILE, 51),
    // math_utils:factorial calls itself recursively
    makeEdge("e::factorial->factorial", "math_utils::factorial", "math_utils::factorial",
      EdgeKind.Call, MATH_UTILS_FILE, 10),
  ];

  return builder.build({
    workspaceRoot: WORKSPACE_ROOT,
    nodes,
    edges,
    fileCount: 3,
    parseTimeMs: 42,
  });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let graph: CodeGraph;
let service: GraphService;

beforeAll(() => {
  graph = buildErlangGraph();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service = new GraphService(WORKSPACE_ROOT, nullLogger as any);
  service.setGraph(graph);
});

// ---------------------------------------------------------------------------
// 1. Graph shape — top-level counts and metadata
// ---------------------------------------------------------------------------

describe("Graph shape", () => {
  it("has more than zero nodes", () => {
    expect(service.nodeCount).toBeGreaterThan(0);
  });

  it("has exactly 11 nodes", () => {
    expect(service.nodeCount).toBe(11);
  });

  it("has more than zero edges", () => {
    expect(service.edgeCount).toBeGreaterThan(0);
  });

  it("has exactly 9 edges", () => {
    expect(service.edgeCount).toBe(9);
  });

  it("includes 'erlang' in graph.languages", () => {
    expect(service.getGraph().languages).toContain("erlang");
  });

  it("reports workspaceRoot correctly", () => {
    expect(service.getGraph().workspaceRoot).toBe(WORKSPACE_ROOT);
  });

  it("has fileCount of 3", () => {
    expect(service.getGraph().fileCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. GraphIndex — searchByName
// ---------------------------------------------------------------------------

describe("GraphIndex — searchByName", () => {
  it("finds kv_store module by name", () => {
    const results = service.searchByName("kv_store");
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.displayName);
    expect(names).toContain("kv_store");
  });

  it("finds start_link functions across modules", () => {
    const results = service.searchByName("start_link");
    // Both kv_store::start_link and kv_sup::start_link match
    expect(results.length).toBe(2);
  });

  it("finds init functions across modules", () => {
    const results = service.searchByName("init");
    expect(results.length).toBe(2);
  });

  it("finds factorial in math_utils", () => {
    const results = service.searchByName("factorial");
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe("factorial");
    expect(results[0]!.module).toBe("math_utils");
  });

  it("returns empty array for unknown name", () => {
    expect(service.searchByName("no_such_function_xyz")).toHaveLength(0);
  });

  it("returns results sorted by displayName", () => {
    const results = service.searchByName("handle");
    const names = results.map((r) => r.displayName);
    expect(names).toEqual([...names].sort());
  });

  it("respects the limit parameter", () => {
    const results = service.searchByName("k", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 3. GraphIndex — nodesInFile / nodesInModule
// ---------------------------------------------------------------------------

describe("GraphIndex — nodesInFile", () => {
  it("returns node ids for kv_store.erl", () => {
    const ids = service.nodesInFile(KV_STORE_FILE);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("includes the kv_store module node in kv_store.erl", () => {
    const ids = service.nodesInFile(KV_STORE_FILE);
    expect(ids).toContain("kv_store::module");
  });

  it("includes kv_store::start_link in kv_store.erl", () => {
    const ids = service.nodesInFile(KV_STORE_FILE);
    expect(ids).toContain("kv_store::start_link");
  });

  it("does not mix kv_sup nodes into kv_store.erl", () => {
    const ids = service.nodesInFile(KV_STORE_FILE);
    expect(ids).not.toContain("kv_sup::start_link");
  });

  it("returns node ids for kv_sup.erl", () => {
    const ids = service.nodesInFile(KV_SUP_FILE);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("kv_sup::module");
  });

  it("returns empty for a non-existent file", () => {
    expect(service.nodesInFile("/no/such/file.erl")).toHaveLength(0);
  });
});

describe("GraphIndex — nodesInModule", () => {
  it("returns all kv_store node ids", () => {
    const ids = service.nodesInModule("kv_store");
    // module node + start_link + init + handle_call + handle_cast + terminate = 6
    expect(ids.length).toBe(6);
  });

  it("returns all kv_sup node ids", () => {
    const ids = service.nodesInModule("kv_sup");
    // module node + start_link + init = 3
    expect(ids.length).toBe(3);
  });

  it("returns all math_utils node ids", () => {
    const ids = service.nodesInModule("math_utils");
    // module node + factorial = 2
    expect(ids.length).toBe(2);
  });

  it("returns empty for unknown module", () => {
    expect(service.nodesInModule("no_such_module")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. GraphService — getIncomingEdges / getOutgoingEdges
// ---------------------------------------------------------------------------

describe("GraphService — incoming and outgoing edges", () => {
  it("kv_store::start_link has outgoing edges", () => {
    const out = service.getOutgoingEdges("kv_store::start_link");
    expect(out.length).toBeGreaterThan(0);
  });

  it("kv_store::start_link calls kv_store::init (outgoing call edge)", () => {
    const out = service.getOutgoingEdges("kv_store::start_link");
    const callsInit = out.some((e) => e.targetId === "kv_store::init" && e.kind === EdgeKind.Call);
    expect(callsInit).toBe(true);
  });

  it("kv_store::init has an incoming call edge from kv_store::start_link", () => {
    const inc = service.getIncomingEdges("kv_store::init");
    const fromStartLink = inc.some((e) => e.sourceId === "kv_store::start_link");
    expect(fromStartLink).toBe(true);
  });

  it("kv_sup::start_link spawns kv_store::start_link", () => {
    const out = service.getOutgoingEdges("kv_sup::start_link");
    const spawnEdge = out.find((e) => e.targetId === "kv_store::start_link");
    expect(spawnEdge).toBeDefined();
    expect(spawnEdge!.kind).toBe(EdgeKind.Spawn);
  });

  it("kv_store::start_link has an incoming spawn edge from kv_sup::start_link", () => {
    const inc = service.getIncomingEdges("kv_store::start_link");
    const spawnEdge = inc.find((e) => e.sourceId === "kv_sup::start_link" && e.kind === EdgeKind.Spawn);
    expect(spawnEdge).toBeDefined();
  });

  it("math_utils::factorial has a self-referential outgoing call edge", () => {
    const out = service.getOutgoingEdges("math_utils::factorial");
    const recursive = out.find((e) => e.targetId === "math_utils::factorial");
    expect(recursive).toBeDefined();
    expect(recursive!.kind).toBe(EdgeKind.Call);
  });

  it("isolated module node has no outgoing edges", () => {
    // The module node itself has no outgoing call edges
    const out = service.getOutgoingEdges("kv_store::module");
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. GraphQuery — neighbourhood
// ---------------------------------------------------------------------------

describe("GraphQuery — neighbourhood", () => {
  it("returns non-null for a known node", () => {
    const result = service.neighbourhood("kv_store::start_link");
    expect(result).not.toBeNull();
  });

  it("returns null for an unknown node", () => {
    expect(service.neighbourhood("no::such::node")).toBeNull();
  });

  it("root node is always included in neighbourhood", () => {
    const result = service.neighbourhood("kv_store::start_link");
    expect(result!.nodes["kv_store::start_link"]).toBeDefined();
    expect(result!.depths["kv_store::start_link"]).toBe(0);
  });

  it("direct neighbours appear at depth 1", () => {
    const result = service.neighbourhood("kv_store::start_link", { maxDepth: 1 });
    // kv_store::init is a direct outgoing neighbour
    expect(result!.nodes["kv_store::init"]).toBeDefined();
    expect(result!.depths["kv_store::init"]).toBe(1);
  });

  it("deeper neighbours appear at depth 2", () => {
    const result = service.neighbourhood("kv_store::start_link", { maxDepth: 2 });
    // start_link → init → handle_call (depth 2)
    expect(result!.nodes["kv_store::handle_call"]).toBeDefined();
    expect(result!.depths["kv_store::handle_call"]).toBe(2);
  });

  it("direction=outgoing does not include incoming neighbours", () => {
    const result = service.neighbourhood("kv_store::init", {
      maxDepth: 1,
      direction: "outgoing",
    });
    // kv_store::start_link is an *incoming* neighbour of init — should not appear
    expect(result!.nodes["kv_store::start_link"]).toBeUndefined();
  });

  it("direction=incoming only follows incoming edges", () => {
    const result = service.neighbourhood("kv_store::init", {
      maxDepth: 1,
      direction: "incoming",
    });
    // kv_store::start_link is an incoming neighbour of init
    expect(result!.nodes["kv_store::start_link"]).toBeDefined();
  });

  it("respects maxNodes limit", () => {
    const result = service.neighbourhood("kv_store::start_link", { maxNodes: 2 });
    expect(Object.keys(result!.nodes).length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 6. GraphQuery — shortestPath
// ---------------------------------------------------------------------------

describe("GraphQuery — shortestPath", () => {
  it("finds path from kv_sup::start_link to kv_store::init", () => {
    const path = service.shortestPath("kv_sup::start_link", "kv_store::init");
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("kv_sup::start_link");
    expect(path!.nodeIds[path!.nodeIds.length - 1]).toBe("kv_store::init");
  });

  it("path from a node to itself has no edges", () => {
    const p = service.shortestPath("kv_store::start_link", "kv_store::start_link");
    expect(p).not.toBeNull();
    expect(p!.nodeIds).toEqual(["kv_store::start_link"]);
    expect(p!.edgeIds).toHaveLength(0);
  });

  it("returns null for unreachable target", () => {
    // math_utils is a completely disconnected subgraph — no path from kv_store to math_utils
    const p = service.shortestPath("kv_store::start_link", "math_utils::factorial");
    expect(p).toBeNull();
  });

  it("returns null for unknown source node", () => {
    expect(service.shortestPath("no::source", "kv_store::init")).toBeNull();
  });

  it("returns null for unknown target node", () => {
    expect(service.shortestPath("kv_store::start_link", "no::target")).toBeNull();
  });

  it("path nodeIds and edgeIds are consistent in length", () => {
    const p = service.shortestPath("kv_sup::start_link", "kv_store::init");
    expect(p).not.toBeNull();
    expect(p!.edgeIds.length).toBe(p!.nodeIds.length - 1);
  });
});

// ---------------------------------------------------------------------------
// 7. GraphQuery — detectCycles
// ---------------------------------------------------------------------------

describe("GraphQuery — detectCycles", () => {
  it("detects the self-recursive cycle in math_utils::factorial", () => {
    const cycles = service.detectCycles("math_utils::factorial");
    expect(cycles.length).toBeGreaterThan(0);
    // The self-loop cycle contains factorial twice (first and last are same)
    const selfLoop = cycles.find(
      (c) => c.nodeIds[0] === "math_utils::factorial" && c.nodeIds[c.nodeIds.length - 1] === "math_utils::factorial",
    );
    expect(selfLoop).toBeDefined();
  });

  it("detects the cycle in the kv_store call chain", () => {
    // handle_call → handle_cast → terminate → handle_call forms a cycle
    const cycles = service.detectCycles("kv_store::handle_call");
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("returns empty for an isolated module node with no edges", () => {
    const cycles = service.detectCycles("math_utils::module");
    expect(cycles).toHaveLength(0);
  });

  it("returns empty for an unknown node", () => {
    expect(service.detectCycles("no::such::node")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. GraphService — getNode / getEdge
// ---------------------------------------------------------------------------

describe("GraphService — getNode / getEdge", () => {
  it("getNode returns the correct node for a known id", () => {
    const node = service.getNode("kv_store::start_link");
    expect(node).toBeDefined();
    expect(node!.displayName).toBe("start_link");
    expect(node!.module).toBe("kv_store");
    expect(node!.language).toBe("erlang");
    expect(node!.kind).toBe(NodeKind.Function);
  });

  it("getNode returns undefined for an unknown id", () => {
    expect(service.getNode("no::such::node")).toBeUndefined();
  });

  it("getEdge returns the spawn edge", () => {
    const edge = service.getEdge("e::sup_start_link->store_start_link");
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe(EdgeKind.Spawn);
    expect(edge!.sourceId).toBe("kv_sup::start_link");
    expect(edge!.targetId).toBe("kv_store::start_link");
  });

  it("getEdge returns undefined for unknown edge id", () => {
    expect(service.getEdge("no::edge")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. GraphService — allFiles / allModules
// ---------------------------------------------------------------------------

describe("GraphService — allFiles / allModules", () => {
  it("allFiles returns all three fixture file paths", () => {
    const files = service.allFiles();
    expect(files).toContain(KV_STORE_FILE);
    expect(files).toContain(KV_SUP_FILE);
    expect(files).toContain(MATH_UTILS_FILE);
  });

  it("allFiles is sorted alphabetically", () => {
    const files = service.allFiles();
    expect(files).toEqual([...files].sort());
  });

  it("allModules includes kv_store, kv_sup, math_utils", () => {
    const modules = service.allModules();
    expect(modules).toContain("kv_store");
    expect(modules).toContain("kv_sup");
    expect(modules).toContain("math_utils");
  });
});

// ---------------------------------------------------------------------------
// 10. GraphService — edgesOfKind
// ---------------------------------------------------------------------------

describe("GraphService — edgesOfKind", () => {
  it("returns call edge ids", () => {
    const callEdgeIds = service.edgesOfKind(EdgeKind.Call);
    expect(callEdgeIds.length).toBeGreaterThan(0);
  });

  it("returns exactly one spawn edge id", () => {
    const spawnEdgeIds = service.edgesOfKind(EdgeKind.Spawn);
    expect(spawnEdgeIds).toHaveLength(1);
    expect(spawnEdgeIds[0]).toBe("e::sup_start_link->store_start_link");
  });
});
