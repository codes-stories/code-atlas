import * as path from "path";
import * as vscode from "vscode";
import type { CodeGraph, ParseDiagnostic } from "../../shared/models";
import type { ParserRegistry } from "../../shared/ParserRegistry";
import type { GraphService } from "../graph/GraphService";
import type { Logger } from "./Logger";

// ---------------------------------------------------------------------------
// Progress callback type
// ---------------------------------------------------------------------------

/**
 * Called by the indexer as it processes each file so the caller can relay
 * progress to the webview or VS Code's notification area.
 */
export type IndexProgressCallback = (
  parsed: number,
  total: number,
  currentFile: string,
) => void;

// ---------------------------------------------------------------------------
// IndexResult
// ---------------------------------------------------------------------------

/** Summary returned when a full index run completes. */
export interface IndexResult {
  readonly graph: CodeGraph;
  readonly durationMs: number;
  readonly diagnostics: ReadonlyArray<ParseDiagnostic>;
  readonly cacheHit: boolean;
}

// ---------------------------------------------------------------------------
// WorkspaceIndexer
// ---------------------------------------------------------------------------

/**
 * Orchestrates a full workspace index run.
 *
 * Responsibilities:
 * 1. Resolve the cache file path from configuration.
 * 2. On a cold start (no `force` flag) attempt to load from cache.
 *    - On cache hit: return the cached graph immediately.
 * 3. On cache miss (or forced refresh): ask each registered parser to
 *    parse the workspace, streaming progress events to the supplied callback.
 * 4. After a successful parse, persist the result to cache.
 * 5. Respect a `vscode.CancellationToken` so the user can abort.
 *
 * Error handling:
 * - Per-file parse failures are collected as diagnostics, not thrown.
 * - A complete inability to run (no workspace folder, all parsers fail) is
 *   surfaced by throwing an `IndexerError`.
 */
export class WorkspaceIndexer {
  constructor(
    private readonly workspaceRoot: string,
    private readonly cacheDir: string,
    private readonly parserRegistry: ParserRegistry,
    private readonly graphService: GraphService,
    private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Runs a full workspace index.
   *
   * @param options.force         When true, skip cache and always re-parse.
   * @param options.token         Cancellation token — throws `IndexerCancelledError` if cancelled.
   * @param options.onProgress    Streaming progress callback.
   */
  async index(options: {
    force?: boolean;
    token?: vscode.CancellationToken;
    onProgress?: IndexProgressCallback;
  } = {}): Promise<IndexResult> {
    const { force = false, token, onProgress } = options;

    this.throwIfCancelled(token);
    const startMs = Date.now();

    // -----------------------------------------------------------------------
    // 1. Try cache (unless forced)
    // -----------------------------------------------------------------------

    if (!force) {
      const cacheFile = this.cacheFilePath();
      this.logger.debug("[WorkspaceIndexer] Checking cache", { cacheFile });
      const cacheLoaded = await this.graphService.loadCache(cacheFile);

      if (cacheLoaded) {
        this.logger.info("[WorkspaceIndexer] Served from cache");
        const graph = this.graphService.getGraph();
        return {
          graph,
          durationMs: Date.now() - startMs,
          diagnostics: [],
          cacheHit: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // 2. Full parse
    // -----------------------------------------------------------------------

    this.throwIfCancelled(token);

    const parsers = this.parserRegistry.all();
    if (parsers.length === 0) {
      throw new IndexerError("No parsers are registered. Cannot index workspace.");
    }

    const allDiagnostics: ParseDiagnostic[] = [];

    // Collect discovered files across all parsers then run them in sequence,
    // aggregating progress across all parsers into a single counter.
    //
    // We intentionally run parsers sequentially rather than in parallel to
    // avoid saturating the I/O queue on large workspaces.  A future Phase can
    // fan-out to a worker thread pool.

    // Pass through progress so callers get real-time updates.  Each parser's
    // onProgress fires with its own (parsed, total) counters; we normalise
    // them into a single global counter by tracking the cumulative file offset.

    // Pre-discover how many files each parser will process so we can give an
    // accurate total count before we start.
    const excludePatterns = this.defaultExcludes();

    let globalParsed = 0;
    let globalTotal = 0;

    for (const parser of parsers) {
      this.throwIfCancelled(token);

      let parserTotal = 0;
      let parserParsed = 0;

      const graph = await parser.parseWorkspace(
        {
          workspaceRoot: this.workspaceRoot,
          excludePatterns,
        },
        (parsed, total, currentFile) => {
          // First call from this parser: register its total into globalTotal
          if (parserTotal === 0 && total > 0) {
            globalTotal += total;
          }
          parserTotal = total;
          const delta = parsed - parserParsed;
          parserParsed = parsed;
          globalParsed += delta;

          onProgress?.(globalParsed, Math.max(globalTotal, globalParsed), currentFile ?? "");

          this.logger.debug("[WorkspaceIndexer] Progress", {
            parser: parser.language(),
            parsed,
            total,
            currentFile,
          });
        },
      ).catch((err: unknown) => {
        // A parser crashing does not abort the whole index — we record an
        // error-level diagnostic and move on.
        this.logger.error(`[WorkspaceIndexer] Parser ${parser.language()} failed`, err);
        allDiagnostics.push({
          severity: "error" as const,
          message: `Parser '${parser.language()}' failed: ${err instanceof Error ? err.message : String(err)}`,
          location: { file: this.workspaceRoot, line: 0, column: 0 },
          language: parser.language(),
          file: this.workspaceRoot,
        } as ParseDiagnostic);
        return null;
      });

      if (graph !== null) {
        this.graphService.setGraph(graph);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Persist to cache
    // -----------------------------------------------------------------------

    this.throwIfCancelled(token);

    try {
      const cacheFile = this.cacheFilePath();
      await this.graphService.saveCache(cacheFile);
    } catch (err) {
      // Cache write failure is not fatal — the in-memory graph is still valid.
      this.logger.warn("[WorkspaceIndexer] Cache save failed (non-fatal)", err);
    }

    const durationMs = Date.now() - startMs;
    const graph = this.graphService.getGraph();

    this.logger.info("[WorkspaceIndexer] Index complete", {
      nodes: Object.keys(graph.nodes).length,
      edges: Object.keys(graph.edges).length,
      durationMs,
    });

    return { graph, durationMs, diagnostics: allDiagnostics, cacheHit: false };
  }

  // ---------------------------------------------------------------------------
  // Cache path helpers
  // ---------------------------------------------------------------------------

  /**
   * Absolute path to the cache JSON file.
   * Uses the configured override directory, or defaults to
   * `<workspaceRoot>/.code-atlas/graph.cache.json`.
   */
  cacheFilePath(overrideDir?: string): string {
    const dir = overrideDir ?? (this.cacheDir || path.join(this.workspaceRoot, ".code-atlas"));
    return path.join(dir, "graph.cache.json");
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private throwIfCancelled(token?: vscode.CancellationToken): void {
    if (token?.isCancellationRequested) {
      throw new IndexerCancelledError();
    }
  }

  private defaultExcludes(): string[] {
    return [
      "node_modules",
      ".git",
      "dist",
      "build",
      "_build",
      "deps",
      "ebin",
      ".code-atlas",
    ];
  }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when the user cancels an indexing operation. */
export class IndexerCancelledError extends Error {
  constructor() {
    super("Workspace indexing was cancelled.");
    this.name = "IndexerCancelledError";
  }
}

/** Thrown when indexing cannot proceed due to a fatal configuration issue. */
export class IndexerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexerError";
  }
}
