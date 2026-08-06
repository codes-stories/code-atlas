import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncrementalParseQueue } from "../../src/extension/services/IncrementalParseQueue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a job that records execution order into `log`. */
function makeJob(label: string, log: string[], delayMs = 0): { label: string; execute: () => Promise<void> } {
  return {
    label,
    execute: async () => {
      if (delayMs > 0) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
      log.push(label);
    },
  };
}

/** Returns a job that throws. */
function makeFailingJob(label: string): { label: string; execute: () => Promise<void> } {
  return {
    label,
    execute: async () => {
      throw new Error(`Job ${label} failed`);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IncrementalParseQueue", () => {
  let queue: IncrementalParseQueue;

  beforeEach(() => {
    queue = new IncrementalParseQueue();
  });

  // -------------------------------------------------------------------------
  // Basic enqueue + drain
  // -------------------------------------------------------------------------

  describe("basic enqueue and drain", () => {
    it("executes a single job", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("a", log));
      await queue.drain();
      expect(log).toEqual(["a"]);
    });

    it("executes multiple jobs in FIFO order", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("a", log));
      queue.enqueue(makeJob("b", log));
      queue.enqueue(makeJob("c", log));
      await queue.drain();
      expect(log).toEqual(["a", "b", "c"]);
    });

    it("drain() resolves immediately when queue is empty", async () => {
      await expect(queue.drain()).resolves.toBeUndefined();
    });

    it("drain() resolves after in-flight job completes", async () => {
      const log: string[] = [];
      // Use a small delay to ensure the job is still running when drain() is called
      queue.enqueue(makeJob("a", log, 10));
      await queue.drain();
      expect(log).toEqual(["a"]);
    });

    it("size reflects pending (not in-flight) job count", () => {
      // Enqueue several jobs — first one starts running immediately
      const log: string[] = [];
      queue.enqueue(makeJob("a", log, 5));
      queue.enqueue(makeJob("b", log));
      queue.enqueue(makeJob("c", log));
      // "a" is in-flight; "b" and "c" are pending
      expect(queue.size).toBe(2);
    });

    it("running is true while a job executes", async () => {
      const runningValues: boolean[] = [];
      queue.enqueue({
        label: "check",
        execute: async () => {
          runningValues.push(queue.running);
        },
      });
      await queue.drain();
      expect(runningValues).toEqual([true]);
    });

    it("running is false after drain", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("a", log));
      await queue.drain();
      expect(queue.running).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Last-write-wins deduplication
  // -------------------------------------------------------------------------

  describe("last-write-wins deduplication", () => {
    it("replaces a pending job with the same label", async () => {
      const calls: string[] = [];

      // Enqueue "a" with a delay so it runs while we enqueue duplicates
      queue.enqueue(makeJob("a", calls, 10));

      // Enqueue "b" twice — second should replace first
      queue.enqueue({ label: "b", execute: async () => { calls.push("b-v1"); } });
      queue.enqueue({ label: "b", execute: async () => { calls.push("b-v2"); } });

      await queue.drain();

      // Only "b-v2" should run, not "b-v1"
      expect(calls).toContain("b-v2");
      expect(calls).not.toContain("b-v1");
    });

    it("does not deduplicate jobs with different labels", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("file-a.erl", log));
      queue.enqueue(makeJob("file-b.erl", log));
      await queue.drain();
      expect(log).toHaveLength(2);
      expect(log).toContain("file-a.erl");
      expect(log).toContain("file-b.erl");
    });

    it("replacing preserves position in the queue", async () => {
      const log: string[] = [];
      // a (in-flight), b, c — replace b with b-new
      queue.enqueue(makeJob("a", log, 5));
      queue.enqueue({ label: "b", execute: async () => { log.push("b-old"); } });
      queue.enqueue(makeJob("c", log));
      // Replace b
      queue.enqueue({ label: "b", execute: async () => { log.push("b-new"); } });

      await queue.drain();

      expect(log[0]).toBe("a");
      expect(log[1]).toBe("b-new");
      expect(log[2]).toBe("c");
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  describe("error isolation", () => {
    it("continues draining after a job throws", async () => {
      const log: string[] = [];
      queue.enqueue(makeFailingJob("bad"));
      queue.enqueue(makeJob("good", log));
      await queue.drain();
      expect(log).toEqual(["good"]);
    });

    it("records the last error from a failing job", async () => {
      queue.enqueue(makeFailingJob("bad"));
      await queue.drain();
      expect(queue.error).toBeInstanceOf(Error);
      expect((queue.error as Error).message).toContain("bad");
    });

    it("error from earlier job does not affect later jobs", async () => {
      const log: string[] = [];
      queue.enqueue(makeFailingJob("fail1"));
      queue.enqueue(makeJob("ok1", log));
      queue.enqueue(makeFailingJob("fail2"));
      queue.enqueue(makeJob("ok2", log));
      await queue.drain();
      expect(log).toEqual(["ok1", "ok2"]);
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe("clear()", () => {
    it("discards all pending jobs", async () => {
      const log: string[] = [];
      // "a" starts running immediately; "b" and "c" are pending
      queue.enqueue(makeJob("a", log, 10));
      queue.enqueue(makeJob("b", log));
      queue.enqueue(makeJob("c", log));
      queue.clear();
      await queue.drain();
      // Only "a" should have run
      expect(log).toEqual(["a"]);
    });

    it("size is 0 after clear()", () => {
      queue.enqueue(makeJob("a", [], 10));
      queue.enqueue(makeJob("b", []));
      queue.enqueue(makeJob("c", []));
      queue.clear();
      expect(queue.size).toBe(0);
    });

    it("queue accepts new jobs after clear()", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("old", log, 10));
      queue.clear();
      await queue.drain();
      queue.enqueue(makeJob("new", log));
      await queue.drain();
      expect(log).toContain("new");
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent drain() callers
  // -------------------------------------------------------------------------

  describe("multiple concurrent drain() callers", () => {
    it("all drain() promises resolve when the queue empties", async () => {
      const log: string[] = [];
      queue.enqueue(makeJob("a", log, 5));
      queue.enqueue(makeJob("b", log));

      const d1 = queue.drain();
      const d2 = queue.drain();
      const d3 = queue.drain();

      await Promise.all([d1, d2, d3]);
      expect(log).toEqual(["a", "b"]);
    });
  });

  // -------------------------------------------------------------------------
  // Serialisation guarantee
  // -------------------------------------------------------------------------

  describe("serialisation", () => {
    it("never runs two jobs concurrently", async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const makeSerialJob = (label: string) => ({
        label,
        execute: async () => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise<void>((r) => setTimeout(r, 2));
          concurrentCount--;
        },
      });

      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeSerialJob(`job-${i}`));
      }

      await queue.drain();
      expect(maxConcurrent).toBe(1);
    });
  });
});
