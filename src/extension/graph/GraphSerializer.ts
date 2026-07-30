import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import type { CodeGraph } from "../../shared/models";

// ---------------------------------------------------------------------------
// Cache envelope
// ---------------------------------------------------------------------------

/** Current cache format version — increment when the schema changes. */
const CACHE_VERSION = 1;

/**
 * The JSON structure written to disk.
 * Wraps the graph in a versioned envelope so stale caches are rejected.
 */
interface CacheEnvelope {
  readonly version: number;
  /** SHA-256 hex digest of the serialised `graph` string for corruption detection. */
  readonly checksum: string;
  readonly graph: CodeGraph;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class CacheVersionError extends Error {
  constructor(found: number, expected: number) {
    super(`Cache version mismatch: found ${found}, expected ${expected}`);
    this.name = "CacheVersionError";
  }
}

export class CacheChecksumError extends Error {
  constructor() {
    super("Cache file failed checksum verification — data may be corrupt");
    this.name = "CacheChecksumError";
  }
}

export class CacheNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Cache file not found: ${filePath}`);
    this.name = "CacheNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// GraphSerializer
// ---------------------------------------------------------------------------

/**
 * Serialises and deserialises a {@link CodeGraph} to/from a JSON file on disk.
 *
 * Features:
 * - Schema versioning rejects stale caches automatically.
 * - SHA-256 checksum detects truncated or corrupt files.
 * - Async I/O — never blocks the extension host event loop.
 * - `saveSafe()` writes to a temporary file then atomically renames to the
 *   target path, preventing partial writes.
 */
export class GraphSerializer {
  /**
   * Serialises a graph to a JSON string.
   * The returned string is the full cache envelope, not just the graph.
   */
  serialise(graph: CodeGraph): string {
    const graphJson = JSON.stringify(graph);
    const checksum = sha256(graphJson);

    const envelope: CacheEnvelope = {
      version: CACHE_VERSION,
      checksum,
      graph: JSON.parse(graphJson) as CodeGraph,
    };

    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Deserialises a JSON string previously produced by `serialise()`.
   *
   * @throws {CacheVersionError}   when the version does not match.
   * @throws {CacheChecksumError}  when the checksum does not match.
   * @throws {SyntaxError}         when the JSON is malformed.
   */
  deserialise(raw: string): CodeGraph {
    const envelope = JSON.parse(raw) as CacheEnvelope;

    if (envelope.version !== CACHE_VERSION) {
      throw new CacheVersionError(envelope.version, CACHE_VERSION);
    }

    // Re-serialise the graph portion to verify the checksum.
    const graphJson = JSON.stringify(envelope.graph);
    const actualChecksum = sha256(graphJson);
    if (actualChecksum !== envelope.checksum) {
      throw new CacheChecksumError();
    }

    return envelope.graph;
  }

  /**
   * Writes the graph to `filePath` atomically:
   * 1. Serialises to `<filePath>.tmp`
   * 2. Renames to `filePath` (atomic on most OS/filesystem combinations)
   *
   * Creates parent directories if they do not exist.
   */
  async saveSafe(graph: CodeGraph, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmp = `${filePath}.tmp`;
    const json = this.serialise(graph);

    await fs.writeFile(tmp, json, "utf8");
    await fs.rename(tmp, filePath);
  }

  /**
   * Loads a graph from `filePath`.
   *
   * @throws {CacheNotFoundError}  when the file does not exist.
   * @throws {CacheVersionError}   when the cache schema is stale.
   * @throws {CacheChecksumError}  when the checksum does not match.
   * @throws {SyntaxError}         when the JSON is malformed.
   */
  async load(filePath: string): Promise<CodeGraph> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new CacheNotFoundError(filePath);
      }
      throw err;
    }

    return this.deserialise(raw);
  }

  /**
   * Returns true when a cache file exists at `filePath`.
   * Does not validate the content — use `load()` for that.
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes the cache file at `filePath`.
   * Safe to call even when the file does not exist.
   */
  async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
