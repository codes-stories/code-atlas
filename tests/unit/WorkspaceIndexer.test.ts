import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  WorkspaceIndexer,
  IndexerError,
  IndexerCancelledError,
} from "../../src/extension/services/WorkspaceIndexer";
import { makeGraph, makeNode, makeEdge } from "./fixtures";
import type { CodeGraph, ParseDiagnostic } from "../../src/shared/models";
import type { LanguageParser, ParseFileInput, ParseWorkspaceInput, DefinitionResult, ReferenceResult, RelationshipResult } from "../../src/shared/LanguageParser";
import type { ParserRegistry } from "../../src/shared/ParserRegistry";
import type { GraphService } from "../../src/extension/graph/GraphService";
import type { Logger } from "../../src/extension/services/Logger";

// ---------------------------------------------------------------------------
// Minimal mock implementations
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Logger;
}

function makeMockParser(language = "erlang", graph?: CodeGraph): LanguageParser {
  const resolvedGraph = graph ?? makeGraph({ workspaceRoot: "/workspace" });
  return {
    language: () => language,
    supports: (f: string) => f.endsWith(".erl"),
    parseWorkspace: vi.fn().mockImplementation(
      async (
        _input: ParseWorkspaceInput,
        onProgress?: (p: number, t: number) => void,
      ): Promise<CodeGraph> => {
        onProgress?.(1, 1);
        return resolvedGraph;
      },
    ),
    parseFile: vi.fn().mockResolvedValue(resolvedGraph),
    getDefinitions: vi.fn().mockResolvedValue([] as DefinitionResult[]),
    getReferences: vi.fn().mockResolvedValue([] as ReferenceResult[]),
    getRelationships: vi.fn().mockResolvedValue({
      nodeId: "n1",
      outgoing: [],
      incoming: [],
    } as RelationshipResult),
    getDiagnostics: vi.fn().mockResolvedValue([] as ParseDiagnostic[]),
  };
}

function makeParserRegistry(parsers: LanguageParser[] = []): ParserRegistry {
  return {
    register: vi.fn(),
    resolve: vi.fn().mockReturnValue(parsers[0] ?? null),
    resolveByLanguage: vi.fn().mockReturnValue(parsers[0] ?? null),
    all: vi.fn().mockReturnValue(parsers),
    languages: vi.fn().mockReturnValue(parsers.map((p) => p.language())),
  } as unknown as ParserRegistry;
}

function makeGraphService(graph?: CodeGraph): {
  service: GraphService;
  setGraphMock: Mock;
  saveCacheMock: Mock;
  loadCacheMock: Mock;
  getGraphMock: Mock;
} {
  const resolvedGraph = graph ?? makeGraph({ workspaceRoot: "/workspace" });
  const setGraphMock = vi.fn();
  const saveCacheMock = vi.fn().mockResolvedValue(undefined);
  const loadCacheMock = vi.fn().mockResolvedValue(false);
  const getGraphMock = vi.fn().mockReturnValue(resolvedGraph);

  const service = {
    setGraph: setGraphMock,
    saveCache: saveCacheMock,
    loadCache: loadCacheMock,
    getGraph: getGraphMock,
    applyPatch: vi.fn(),
    removeFile: vi.fn(),
    getNode: vi.fn(),
    getEdge: vi.fn(),
    getIncomingEdges: vi.fn().mockReturnValue([]),
    getOutgoingEdges: vi.fn().mockReturnValue([]),
  } as unknown as GraphService;

  return { service, setGraphMock, saveCacheMock, loadCacheMock, getGraphMock };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("WorkspaceIndexer", () => {
  const workspaceRoot = "/workspace";
  const cacheDir = "/workspace/.code-atlas";

  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  // -------------------------------------------------------------------------
  // cacheFilePath()
  // -------------------------------------------------------------------------

  describe("cacheFilePath()", () => {
    it("uses default .code-atlas dir when cacheDir is empty", () => {
      const { service } = makeGraphService();
      const indexer = new WorkspaceIndexer(
        workspaceRoot,
        "",
        makeParserRegistry(),
        service,
        logger,
      );
      expect(indexer.cacheFilePath()).toBe("/workspace/.code-atlas/graph.cache.json");
    });

    it("uses the configured cacheDir when set", () => {
      const { service } = makeGraphService();
      const indexer = new WorkspaceIndexer(
        workspaceRoot,
        "/custom/cache",
        makeParserRegistry(),
        service,
        logger,
      );
      expect(indexer.cacheFilePath()).toBe("/custom/cache/graph.cache.json");
    });

    it("respects an explicit overrideDir argument", () => {
      const { service } = makeGraphService();
      const indexer = new WorkspaceIndexer(
        workspaceRoot,
        "",
        makeParserRegistry(),
        service,
        logger,
      );
      expect(indexer.cacheFilePath("/override")).toBe("/override/graph.cache.json");
    });
  });

  // -------------------------------------------------------------------------
  // Cache hit — cold start
  // -------------------------------------------------------------------------

  describe("cache hit", () => {
    it("returns cached graph without running parsers", async () => {
      const cachedGraph = makeGraph({
        workspaceRoot,
        nodes: [makeNode({ id: "cached-node" })],
      });

      const parser = makeMockParser("erlang", cachedGraph);
      const registry = makeParserRegistry([parser]);
      const { service, loadCacheMock, getGraphMock } = makeGraphService(cachedGraph);
      loadCacheMock.mockResolvedValue(true);

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.cacheHit).toBe(true);
      expect(loadCacheMock).toHaveBeenCalledOnce();
      expect(parser.parseWorkspace).not.toHaveBeenCalled();
      expect(getGraphMock).toHaveBeenCalled();
    });

    it("skips cache when force=true", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service, loadCacheMock } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index({ force: true });

      expect(loadCacheMock).not.toHaveBeenCalled();
      expect(parser.parseWorkspace).toHaveBeenCalledOnce();
      expect(result.cacheHit).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Cache miss — full parse
  // -------------------------------------------------------------------------

  describe("cache miss — full parse", () => {
    it("calls parseWorkspace on every registered parser", async () => {
      const parserA = makeMockParser("erlang");
      const parserB = makeMockParser("go");
      const registry: ParserRegistry = {
        ...makeParserRegistry([parserA, parserB]),
        all: vi.fn().mockReturnValue([parserA, parserB]),
      } as unknown as ParserRegistry;

      const { service } = makeGraphService();
      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await indexer.index();

      expect(parserA.parseWorkspace).toHaveBeenCalledOnce();
      expect(parserB.parseWorkspace).toHaveBeenCalledOnce();
    });

    it("calls graphService.setGraph after each parser", async () => {
      const graph = makeGraph({ workspaceRoot });
      const parser = makeMockParser("erlang", graph);
      const registry = makeParserRegistry([parser]);
      const { service, setGraphMock } = makeGraphService(graph);

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await indexer.index();

      expect(setGraphMock).toHaveBeenCalledWith(graph);
    });

    it("persists to cache after a successful parse", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service, saveCacheMock } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await indexer.index();

      expect(saveCacheMock).toHaveBeenCalledOnce();
      expect(saveCacheMock).toHaveBeenCalledWith(
        expect.stringContaining("graph.cache.json"),
      );
    });

    it("returns cacheHit=false after a full parse", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.cacheHit).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Progress reporting
  // -------------------------------------------------------------------------

  describe("progress reporting", () => {
    it("invokes onProgress at least once per parser file", async () => {
      const parser = makeMockParser();
      (parser.parseWorkspace as Mock).mockImplementation(
        async (_input: ParseWorkspaceInput, onProgress?: (p: number, t: number) => void) => {
          onProgress?.(1, 3);
          onProgress?.(2, 3);
          onProgress?.(3, 3);
          return makeGraph({ workspaceRoot });
        },
      );

      const registry = makeParserRegistry([parser]);
      const { service } = makeGraphService();
      const progressCalls: Array<[number, number, string]> = [];

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await indexer.index({
        onProgress: (parsed, total, file) => {
          progressCalls.push([parsed, total, file]);
        },
      });

      expect(progressCalls.length).toBe(3);
      expect(progressCalls[2]![0]).toBe(3); // globalParsed reached 3
    });

    it("accumulates progress across multiple parsers", async () => {
      const parserA = makeMockParser("erlang");
      const parserB = makeMockParser("go");

      (parserA.parseWorkspace as Mock).mockImplementation(
        async (_input: ParseWorkspaceInput, onProgress?: (p: number, t: number) => void) => {
          onProgress?.(1, 1);
          return makeGraph({ workspaceRoot });
        },
      );

      (parserB.parseWorkspace as Mock).mockImplementation(
        async (_input: ParseWorkspaceInput, onProgress?: (p: number, t: number) => void) => {
          onProgress?.(1, 2);
          onProgress?.(2, 2);
          return makeGraph({ workspaceRoot });
        },
      );

      const registry: ParserRegistry = {
        ...makeParserRegistry([parserA, parserB]),
        all: vi.fn().mockReturnValue([parserA, parserB]),
      } as unknown as ParserRegistry;

      const { service } = makeGraphService();
      const parsedValues: number[] = [];

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await indexer.index({
        onProgress: (parsed) => { parsedValues.push(parsed); },
      });

      // Parser A fires: globalParsed=1
      // Parser B fires twice: globalParsed=2, globalParsed=3
      expect(parsedValues).toEqual([1, 2, 3]);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("throws IndexerError when no parsers are registered", async () => {
      const emptyRegistry = makeParserRegistry([]);
      const { service } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, emptyRegistry, service, logger);

      await expect(indexer.index()).rejects.toThrow(IndexerError);
      await expect(indexer.index()).rejects.toThrow("No parsers are registered");
    });

    it("records a diagnostic when a parser throws but does not abort the index", async () => {
      const badParser = makeMockParser("erlang");
      (badParser.parseWorkspace as Mock).mockRejectedValue(new Error("parse exploded"));

      const registry = makeParserRegistry([badParser]);
      const { service } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.message).toContain("parse exploded");
      expect(result.diagnostics[0]!.severity).toBe("error");
    });

    it("logs a warning when cache save fails but still returns a result", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service, saveCacheMock } = makeGraphService();
      saveCacheMock.mockRejectedValue(new Error("disk full"));

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.graph).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Cache save failed"),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  describe("cancellation", () => {
    it("throws IndexerCancelledError when token is already cancelled at start", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service } = makeGraphService();

      const token = {
        isCancellationRequested: true,
        onCancellationRequested: vi.fn(),
      };

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);

      await expect(indexer.index({ token })).rejects.toThrow(IndexerCancelledError);
      expect(parser.parseWorkspace).not.toHaveBeenCalled();
    });

    it("throws IndexerCancelledError when token is cancelled mid-parse", async () => {
      let isCancelled = false;

      const parser = makeMockParser("erlang");
      (parser.parseWorkspace as Mock).mockImplementation(
        async (_input: ParseWorkspaceInput, onProgress?: (p: number, t: number) => void) => {
          onProgress?.(1, 2);
          // Simulate cancellation between files
          isCancelled = true;
          onProgress?.(2, 2);
          return makeGraph({ workspaceRoot });
        },
      );

      const parserB = makeMockParser("go");

      const registry: ParserRegistry = {
        ...makeParserRegistry([parser, parserB]),
        all: vi.fn().mockReturnValue([parser, parserB]),
      } as unknown as ParserRegistry;

      const { service } = makeGraphService();

      const token = {
        get isCancellationRequested() { return isCancelled; },
        onCancellationRequested: vi.fn(),
      };

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      await expect(indexer.index({ token })).rejects.toThrow(IndexerCancelledError);

      // Second parser should not be reached
      expect(parserB.parseWorkspace).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------

  describe("result shape", () => {
    it("includes durationMs as a positive number", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns the graph from graphService.getGraph()", async () => {
      const expected = makeGraph({
        workspaceRoot,
        nodes: [makeNode({ id: "n1" }), makeNode({ id: "n2" })],
        edges: [makeEdge({ id: "e1", sourceId: "n1", targetId: "n2" })],
      });

      const parser = makeMockParser("erlang", expected);
      const registry = makeParserRegistry([parser]);
      const { service, getGraphMock } = makeGraphService(expected);

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.graph).toBe(getGraphMock());
    });

    it("returns empty diagnostics on a clean parse", async () => {
      const parser = makeMockParser();
      const registry = makeParserRegistry([parser]);
      const { service } = makeGraphService();

      const indexer = new WorkspaceIndexer(workspaceRoot, cacheDir, registry, service, logger);
      const result = await indexer.index();

      expect(result.diagnostics).toHaveLength(0);
    });
  });
});
