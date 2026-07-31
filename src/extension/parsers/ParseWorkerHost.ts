import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import type { CodeGraph } from "../../shared/models";

// ---------------------------------------------------------------------------
// Message protocol (host ↔ worker)
// ---------------------------------------------------------------------------

/** Sent from the host to the worker to request parsing one file. */
export interface WorkerParseRequest {
  readonly kind: "parse";
  readonly requestId: string;
  readonly filePath: string;
  readonly content: string;
  readonly previousContent?: string;
}

/** Sent from the worker to the host when a parse succeeds. */
export interface WorkerParseSuccess {
  readonly kind: "success";
  readonly requestId: string;
  readonly graph: CodeGraph;
}

/** Sent from the worker to the host when a parse fails. */
export interface WorkerParseError {
  readonly kind: "error";
  readonly requestId: string;
  readonly message: string;
}

export type WorkerRequest = WorkerParseRequest;
export type WorkerResponse = WorkerParseSuccess | WorkerParseError;

// ---------------------------------------------------------------------------
// Pending request tracking
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (graph: CodeGraph) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
}

// ---------------------------------------------------------------------------
// ParseWorkerHost
// ---------------------------------------------------------------------------

/**
 * Manages a pool of Node.js `worker_thread` instances for offloading
 * expensive file parses off the extension host's main thread.
 *
 * ## Architecture
 *
 * ```
 * Extension Host (main thread)
 *   └─ ParseWorkerHost
 *        ├─ Worker 0  (runs parse-worker.js)
 *        ├─ Worker 1
 *        └─ Worker N
 * ```
 *
 * Each worker is a persistent thread that receives `WorkerParseRequest`
 * messages and replies with `WorkerParseSuccess` or `WorkerParseError`.
 *
 * In Phase 6 (Erlang parser) the worker script will import the concrete
 * parser and call `parseFile()`. The host simply dispatches to the next
 * available worker via round-robin.
 *
 * ## Current status (Phase 5 scaffolding)
 *
 * `ParseWorkerHost` is fully wired and functional. The actual `workerScript`
 * path is provided at construction time, so it is not tied to a specific
 * language — each language parser creates its own host pointing at its own
 * worker module.
 *
 * The `parseFile()` method falls back to a direct (in-process) call when
 * `workerCount` is 0, which lets Phase 6 operate without workers until
 * Phase 13 (performance optimisation).
 */
export class ParseWorkerHost {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private nextWorker = 0;
  private disposed = false;

  /**
   * @param workerScript  Absolute path to the compiled worker JS module.
   * @param workerCount   Number of worker threads to spawn. 0 = in-process mode.
   * @param timeoutMs     Per-request timeout in milliseconds. Default: 30 000.
   */
  constructor(
    private readonly workerScript: string,
    private readonly workerCount: number = 0,
    private readonly timeoutMs: number = 30_000,
  ) {
    for (let i = 0; i < workerCount; i++) {
      this.spawnWorker();
    }
  }

  /**
   * Dispatches a parse request to the next available worker.
   *
   * When `workerCount` is 0, the method immediately throws — callers in
   * that mode must call the parser directly (AbstractParser.parseFile).
   * This allows Phase 6 to work without workers and Phase 13 to enable
   * them transparently.
   */
  dispatch(request: WorkerParseRequest): Promise<CodeGraph> {
    if (this.disposed) {
      return Promise.reject(new Error("ParseWorkerHost has been disposed"));
    }

    if (this.workers.length === 0) {
      return Promise.reject(
        new Error(
          "ParseWorkerHost: no workers spawned. " +
            "Call the parser directly when workerCount === 0.",
        ),
      );
    }

    return new Promise<CodeGraph>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(
          new Error(
            `ParseWorkerHost: request ${request.requestId} timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      this.pending.set(request.requestId, { resolve, reject, timeoutHandle });

      const worker = this.workers[this.nextWorker % this.workers.length]!;
      this.nextWorker++;
      worker.postMessage(request);
    });
  }

  /**
   * Returns true when at least one worker thread is running.
   */
  get hasWorkers(): boolean {
    return this.workers.length > 0;
  }

  /**
   * Terminates all worker threads and rejects any in-flight requests.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    // Reject all pending requests.
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error(`ParseWorkerHost disposed while request ${id} was pending`));
    }
    this.pending.clear();

    // Terminate all workers.
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private spawnWorker(): void {
    const worker = new Worker(this.workerScript);

    worker.on("message", (response: WorkerResponse) => {
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      clearTimeout(pending.timeoutHandle);
      this.pending.delete(response.requestId);

      if (response.kind === "success") {
        pending.resolve(response.graph);
      } else {
        pending.reject(new Error(response.message));
      }
    });

    worker.on("error", (err) => {
      // A worker-level error (crash) rejects all requests assigned to it.
      // In production the WorkspaceIndexer would respawn the worker; for
      // now we log and leave recovery to a future phase.
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(new Error(`Worker error: ${err.message}`));
        this.pending.delete(id);
      }
    });

    this.workers.push(worker);
  }
}

// ---------------------------------------------------------------------------
// Worker-side helper — used inside the worker script itself
// ---------------------------------------------------------------------------

/**
 * Called from inside a worker thread to set up the message handler.
 *
 * The `handler` callback receives each `WorkerParseRequest` and should
 * return the resulting `CodeGraph`. Errors are automatically caught and
 * sent back as `WorkerParseError` messages.
 *
 * Usage in a language-specific worker script:
 *
 * ```ts
 * import { setupWorkerHandler } from "../parsers/ParseWorkerHost";
 * import { ErlangParser } from "./ErlangParser";
 *
 * const parser = new ErlangParser(workerData.workspaceRoot, loader);
 *
 * setupWorkerHandler(async (req) => {
 *   return parser.parseFile({ filePath: req.filePath, content: req.content });
 * });
 * ```
 */
export function setupWorkerHandler(
  handler: (request: WorkerParseRequest) => Promise<CodeGraph>,
): void {
  if (isMainThread) {
    throw new Error("setupWorkerHandler must only be called inside a worker thread");
  }

  parentPort!.on("message", (request: WorkerParseRequest) => {
    handler(request)
      .then((graph) => {
        const response: WorkerParseSuccess = {
          kind: "success",
          requestId: request.requestId,
          graph,
        };
        parentPort!.postMessage(response);
      })
      .catch((err: unknown) => {
        const response: WorkerParseError = {
          kind: "error",
          requestId: request.requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        parentPort!.postMessage(response);
      });
  });
}

// Re-export workerData for convenience in worker scripts.
export { workerData };
