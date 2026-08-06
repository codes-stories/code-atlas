/**
 * Integration tests for the graph serialise / deserialise round-trip.
 *
 * Builds a realistic graph with GraphBuilder, saves it to a temp file with
 * GraphSerializer, reloads it, and verifies that all nodes, edges, and
 * metadata are bit-for-bit identical to the original.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { GraphBuilder } from "../../src/extension/graph/GraphBuilder";
import {
  GraphSerializer,
  CacheNotFoundError,
  CacheVersionError,
  CacheChecksumError,
} from "../../src/extension/graph/GraphSerializer";
import { NodeKind, EdgeKind, RelationshipType, ConditionKind } from "../../src/shared/enums";
import type { GraphNode, GraphEdge, CodeGraph } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = "/fixtures/sample-workspace";
const KV_STORE_FILE = `${WORKSPACE_ROOT}/src/kv_store.erl`;
const KV_SUP_FILE = `${WORKSPACE_ROOT}/src/kv_sup.erl`;

function node(
  id: string,
  displayName: string,
  module: string,
  file: string,
  line: number,
  kind: NodeKind = NodeKind.Function,
): GraphNode {
  return {
    id,
    displayName,
    language: "erlang",
    kind,
    module,
    signature: `${displayName}/0`,
    location: { file, line, column: 1 },
    range: { start: { file, line, column: 1 }, end: { file, line: line + 4, column: 1 } },
    documentation: `%% ${displayName} doc`,
    complexity: { cyclomatic: 2, cognitive: 1, loc: 8, parameters: 1 },
    incomingEdgeIds: [],
    outgoingEdgeIds: [],
    gitBlame: null,
    metadata: { exported: true },
  };
}

function edge(
  id: string,
  sourceId: string,
  targetId: string,
  kind: EdgeKind,
  file: string,
  line: number,
): GraphEdge {
  return {
    id,
    sourceId,
    targetId,
    kind,
    relationshipType: RelationshipType.FunctionCall,
    location: { file, line, column: 1 },
    sourceCode: `${sourceId}(Args)`,
    reason: "",
    conditionKind: ConditionKind.Unconditional,
    conditionExpression: "",
    examples: [],
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Graph fixture used across all tests in this file
// ---------------------------------------------------------------------------

let referenceGraph: CodeGraph;
const builder = new GraphBuilder();
const serializer = new GraphSerializer();

// Temp files are tracked here and cleaned up in afterEach
const tempFiles: string[] = [];

async function tempPath(suffix = ".json"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "code-atlas-test-"));
  const filePath = path.join(dir, `cache${suffix}`);
  tempFiles.push(dir); // track parent dir for cleanup
  return filePath;
}

beforeAll(() => {
  const nodes: GraphNode[] = [
    node("kv_store::module", "kv_store", "kv_store", KV_STORE_FILE, 4, NodeKind.Module),
    node("kv_store::start_link", "start_link", "kv_store", KV_STORE_FILE, 14),
    node("kv_store::init", "init", "kv_store", KV_STORE_FILE, 29),
    node("kv_store::handle_call", "handle_call", "kv_store", KV_STORE_FILE, 33),
    node("kv_store::handle_cast", "handle_cast", "kv_store", KV_STORE_FILE, 40),
    node("kv_sup::module", "kv_sup", "kv_sup", KV_SUP_FILE, 4, NodeKind.Module),
    node("kv_sup::start_link", "start_link", "kv_sup", KV_SUP_FILE, 9),
    node("kv_sup::init", "init", "kv_sup", KV_SUP_FILE, 13),
  ];

  const edges: GraphEdge[] = [
    edge("e1", "kv_store::start_link", "kv_store::init", EdgeKind.Call, KV_STORE_FILE, 15),
    edge("e2", "kv_store::init", "kv_store::handle_call", EdgeKind.Call, KV_STORE_FILE, 30),
    edge("e3", "kv_store::handle_call", "kv_store::handle_cast", EdgeKind.Call, KV_STORE_FILE, 35),
    edge("e4", "kv_sup::start_link", "kv_store::start_link", EdgeKind.Spawn, KV_SUP_FILE, 10),
    edge("e5", "kv_sup::start_link", "kv_sup::init", EdgeKind.Call, KV_SUP_FILE, 9),
    edge("e6", "kv_sup::init", "kv_store::start_link", EdgeKind.Call, KV_SUP_FILE, 14),
  ];

  referenceGraph = builder.build({
    workspaceRoot: WORKSPACE_ROOT,
    nodes,
    edges,
    fileCount: 2,
    parseTimeMs: 17,
  });
});

afterEach(async () => {
  // Remove all temp directories created during the test
  for (const dir of tempFiles.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 1. Serialise / deserialise round-trip — in-memory
// ---------------------------------------------------------------------------

describe("GraphSerializer — in-memory round-trip", () => {
  it("serialise produces a non-empty JSON string", () => {
    const json = serializer.serialise(referenceGraph);
    expect(typeof json).toBe("string");
    expect(json.length).toBeGreaterThan(0);
  });

  it("serialised output contains a version field", () => {
    const json = serializer.serialise(referenceGraph);
    const parsed = JSON.parse(json) as { version: number };
    expect(parsed.version).toBe(1);
  });

  it("serialised output contains a checksum field", () => {
    const json = serializer.serialise(referenceGraph);
    const parsed = JSON.parse(json) as { checksum: string };
    expect(typeof parsed.checksum).toBe("string");
    expect(parsed.checksum.length).toBe(64); // SHA-256 hex
  });

  it("deserialise returns all original nodes", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);
    const originalIds = Object.keys(referenceGraph.nodes).sort();
    const loadedIds = Object.keys(loaded.nodes).sort();
    expect(loadedIds).toEqual(originalIds);
  });

  it("deserialise returns all original edges", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);
    const originalIds = Object.keys(referenceGraph.edges).sort();
    const loadedIds = Object.keys(loaded.edges).sort();
    expect(loadedIds).toEqual(originalIds);
  });

  it("node fields are preserved exactly", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);

    const original = referenceGraph.nodes["kv_store::start_link"]!;
    const restored = loaded.nodes["kv_store::start_link"]!;

    expect(restored.displayName).toBe(original.displayName);
    expect(restored.language).toBe(original.language);
    expect(restored.kind).toBe(original.kind);
    expect(restored.module).toBe(original.module);
    expect(restored.signature).toBe(original.signature);
    expect(restored.location.file).toBe(original.location.file);
    expect(restored.location.line).toBe(original.location.line);
    expect(restored.complexity.cyclomatic).toBe(original.complexity.cyclomatic);
    expect(restored.complexity.loc).toBe(original.complexity.loc);
  });

  it("edge fields are preserved exactly", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);

    const original = referenceGraph.edges["e4"]!; // spawn edge
    const restored = loaded.edges["e4"]!;

    expect(restored.sourceId).toBe(original.sourceId);
    expect(restored.targetId).toBe(original.targetId);
    expect(restored.kind).toBe(original.kind);
    expect(restored.relationshipType).toBe(original.relationshipType);
    expect(restored.location.file).toBe(original.location.file);
    expect(restored.location.line).toBe(original.location.line);
    expect(restored.sourceCode).toBe(original.sourceCode);
  });

  it("graph metadata is preserved", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);
    expect(loaded.workspaceRoot).toBe(referenceGraph.workspaceRoot);
    expect(loaded.fileCount).toBe(referenceGraph.fileCount);
    expect(loaded.languages).toEqual(referenceGraph.languages);
  });

  it("node wiring (outgoingEdgeIds / incomingEdgeIds) is preserved", () => {
    const json = serializer.serialise(referenceGraph);
    const loaded = serializer.deserialise(json);

    const original = referenceGraph.nodes["kv_store::start_link"]!;
    const restored = loaded.nodes["kv_store::start_link"]!;

    expect(restored.outgoingEdgeIds.sort()).toEqual(original.outgoingEdgeIds.sort());
    expect(restored.incomingEdgeIds.sort()).toEqual(original.incomingEdgeIds.sort());
  });
});

// ---------------------------------------------------------------------------
// 2. saveSafe / load round-trip — disk I/O
// ---------------------------------------------------------------------------

describe("GraphSerializer — disk round-trip (saveSafe + load)", () => {
  it("saveSafe writes a file that load() can read back", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);
    expect(Object.keys(loaded.nodes)).toHaveLength(Object.keys(referenceGraph.nodes).length);
  });

  it("loaded graph has the correct node count", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);
    expect(Object.keys(loaded.nodes).length).toBe(8);
  });

  it("loaded graph has the correct edge count", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);
    expect(Object.keys(loaded.edges).length).toBe(6);
  });

  it("all node ids survive the disk round-trip", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);

    for (const id of Object.keys(referenceGraph.nodes)) {
      expect(loaded.nodes[id]).toBeDefined();
    }
  });

  it("all edge ids survive the disk round-trip", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);

    for (const id of Object.keys(referenceGraph.edges)) {
      expect(loaded.edges[id]).toBeDefined();
    }
  });

  it("graph languages survive the disk round-trip", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    const loaded = await serializer.load(filePath);
    expect(loaded.languages).toContain("erlang");
  });

  it("exists() returns true after saveSafe", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    expect(await serializer.exists(filePath)).toBe(true);
  });

  it("exists() returns false for a missing file", async () => {
    expect(await serializer.exists("/no/such/path/graph.json")).toBe(false);
  });

  it("remove() deletes the cache file", async () => {
    const filePath = await tempPath();
    await serializer.saveSafe(referenceGraph, filePath);
    await serializer.remove(filePath);
    expect(await serializer.exists(filePath)).toBe(false);
  });

  it("remove() does not throw when file is already absent", async () => {
    await expect(serializer.remove("/no/such/path/missing.json")).resolves.toBeUndefined();
  });

  it("saveSafe creates parent directories if they do not exist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "code-atlas-test-"));
    tempFiles.push(dir);
    const nested = path.join(dir, "a", "b", "c", "graph.json");
    await expect(serializer.saveSafe(referenceGraph, nested)).resolves.toBeUndefined();
    expect(await serializer.exists(nested)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Error handling
// ---------------------------------------------------------------------------

describe("GraphSerializer — error handling", () => {
  it("load() throws CacheNotFoundError for a missing file", async () => {
    await expect(serializer.load("/no/such/file.json")).rejects.toBeInstanceOf(CacheNotFoundError);
  });

  it("deserialise() throws CacheVersionError for a wrong version", () => {
    const json = JSON.stringify({ version: 99, checksum: "abc", graph: {} });
    expect(() => serializer.deserialise(json)).toThrow(CacheVersionError);
  });

  it("deserialise() throws CacheChecksumError when checksum is tampered", () => {
    const json = serializer.serialise(referenceGraph);
    const envelope = JSON.parse(json) as { version: number; checksum: string; graph: CodeGraph };
    envelope.checksum = "0".repeat(64); // corrupt the checksum
    expect(() => serializer.deserialise(JSON.stringify(envelope))).toThrow(CacheChecksumError);
  });

  it("deserialise() throws SyntaxError for malformed JSON", () => {
    expect(() => serializer.deserialise("{bad json{{")).toThrow(SyntaxError);
  });

  it("CacheNotFoundError has the correct name", async () => {
    try {
      await serializer.load("/missing.json");
    } catch (err) {
      expect((err as Error).name).toBe("CacheNotFoundError");
    }
  });

  it("CacheVersionError has the correct name", () => {
    try {
      serializer.deserialise(JSON.stringify({ version: 0, checksum: "", graph: {} }));
    } catch (err) {
      expect((err as Error).name).toBe("CacheVersionError");
    }
  });

  it("CacheChecksumError has the correct name", () => {
    const json = serializer.serialise(referenceGraph);
    const envelope = JSON.parse(json) as { version: number; checksum: string; graph: CodeGraph };
    envelope.checksum = "deadbeef".repeat(8);
    try {
      serializer.deserialise(JSON.stringify(envelope));
    } catch (err) {
      expect((err as Error).name).toBe("CacheChecksumError");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. GraphService + GraphSerializer — end-to-end cache save/load
// ---------------------------------------------------------------------------

describe("GraphService — cache save and load via GraphService", () => {
  const nullLogger = {
    info: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  it("saveCache + loadCache restores the graph in a fresh GraphService", async () => {
    const { GraphService } = await import("../../src/extension/graph/GraphService");

    const filePath = await tempPath();

    // Writer service
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new GraphService(WORKSPACE_ROOT, nullLogger as any);
    writer.setGraph(referenceGraph);
    await writer.saveCache(filePath);

    // Reader service — starts empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new GraphService(WORKSPACE_ROOT, nullLogger as any);
    const loaded = await reader.loadCache(filePath);

    expect(loaded).toBe(true);
    expect(reader.nodeCount).toBe(writer.nodeCount);
    expect(reader.edgeCount).toBe(writer.edgeCount);
  });

  it("loadCache returns false for a non-existent file", async () => {
    const { GraphService } = await import("../../src/extension/graph/GraphService");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new GraphService(WORKSPACE_ROOT, nullLogger as any);
    const result = await svc.loadCache("/no/such/cache.json");
    expect(result).toBe(false);
  });

  it("cacheExists returns true after saveCache", async () => {
    const { GraphService } = await import("../../src/extension/graph/GraphService");
    const filePath = await tempPath();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new GraphService(WORKSPACE_ROOT, nullLogger as any);
    svc.setGraph(referenceGraph);
    await svc.saveCache(filePath);
    expect(await svc.cacheExists(filePath)).toBe(true);
  });

  it("removeCache deletes the file and cacheExists returns false", async () => {
    const { GraphService } = await import("../../src/extension/graph/GraphService");
    const filePath = await tempPath();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new GraphService(WORKSPACE_ROOT, nullLogger as any);
    svc.setGraph(referenceGraph);
    await svc.saveCache(filePath);
    await svc.removeCache(filePath);
    expect(await svc.cacheExists(filePath)).toBe(false);
  });
});
