// ---------------------------------------------------------------------------
// Job type
// ---------------------------------------------------------------------------

/**
 * A single unit of work accepted by the queue.
 * `execute` is an async thunk; errors thrown inside it are caught by the
 * queue and do not halt subsequent jobs.
 */
export interface ParseJob {
  /** Human-readable label used in logging and test assertions. */
  readonly label: string;
  /** The async work to run. */
  readonly execute: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// IncrementalParseQueue
// ---------------------------------------------------------------------------

/**
 * A lightweight sequential async queue for file re-parse jobs.
 *
 * ## Why this exists
 *
 * When the user saves multiple files in quick succession (e.g., a bulk
 * format-on-save, or checking out a branch), the `FileWatcher` debounce
 * fires several times in a short window.  Without serialisation, two
 * `graphService.applyPatch()` calls could overlap and corrupt the in-memory
 * graph.
 *
 * ## Guarantees
 *
 * - Jobs are executed one at a time, strictly in FIFO order.
 * - If a job throws, the error is recorded and the queue drains normally.
 * - Enqueuing a job for a file that already has a pending job **replaces**
 *   the pending entry (last-write-wins: only the most recent save matters).
 * - `drain()` returns a Promise that resolves after all currently-queued
 *   jobs have finished, including the one in flight.
 * - `clear()` discards pending jobs that have not started yet (does NOT
 *   cancel the in-flight job).
 *
 * ## Implementation
 *
 * The queue is a plain array.  A single `isRunning` flag prevents re-entrancy.
 * No `setTimeout`/`setInterval` is used — the pump is triggered exclusively
 * by `enqueue()` and by each job's completion.
 */
export class IncrementalParseQueue {
  /** Jobs waiting to run. Index 0 is the next to run. */
  private readonly pending: ParseJob[] = [];
  /** True while a job is executing. */
  private isRunning = false;
  /** Resolvers from `drain()` calls waiting for the queue to empty. */
  private drainResolvers: Array<() => void> = [];
  /** Last error caught from a job — exposed for testing. */
  private lastError: unknown = null;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Adds a job to the queue.
   *
   * If a pending (not-yet-started) job with the same `label` already exists,
   * it is replaced by this new one so only the latest version of a file
   * re-parse runs.
   */
  enqueue(job: ParseJob): void {
    const existing = this.pending.findIndex((j) => j.label === job.label);
    if (existing !== -1) {
      // Replace stale job with the fresh one
      this.pending.splice(existing, 1, job);
    } else {
      this.pending.push(job);
    }

    if (!this.isRunning) {
      void this.pump();
    }
  }

  /**
   * Returns a Promise that resolves once the queue is fully empty (all
   * currently queued jobs, including the in-flight one, have completed).
   *
   * If the queue is already empty, resolves immediately.
   */
  drain(): Promise<void> {
    if (!this.isRunning && this.pending.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  /**
   * Discards all pending (not-yet-started) jobs.
   * The currently in-flight job is not affected.
   */
  clear(): void {
    this.pending.length = 0;
  }

  /** Number of jobs waiting to start (excludes the in-flight job). */
  get size(): number {
    return this.pending.length;
  }

  /** True when a job is currently executing. */
  get running(): boolean {
    return this.isRunning;
  }

  /** The last error thrown by any job (null if no error has occurred). */
  get error(): unknown {
    return this.lastError;
  }

  // ---------------------------------------------------------------------------
  // Private — pump loop
  // ---------------------------------------------------------------------------

  private async pump(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.isRunning = true;

      try {
        await job.execute();
      } catch (err) {
        // Record the error but continue draining
        this.lastError = err;
      } finally {
        this.isRunning = false;
      }
    }

    // Queue is now empty — notify all drain() waiters
    const resolvers = this.drainResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }
}
