import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FileDiscoveryOptions {
  /**
   * Glob-style patterns to exclude, matched against the path relative to
   * `workspaceRoot`. Supports `*`, `**`, `?` and `[…]` character classes.
   *
   * Examples: `["node_modules/**", "_build/**", "*.beam"]`
   */
  readonly excludePatterns: ReadonlyArray<string>;

  /**
   * File extensions to include (with leading dot, e.g. `[".erl", ".hrl"]`).
   * When empty all extensions are accepted.
   */
  readonly extensions: ReadonlyArray<string>;

  /**
   * Maximum directory depth to recurse. 0 = only the root directory itself.
   * Default: unlimited (Number.MAX_SAFE_INTEGER).
   */
  readonly maxDepth?: number;
}

// ---------------------------------------------------------------------------
// FileDiscovery
// ---------------------------------------------------------------------------

/**
 * Recursively walks a workspace directory and returns the list of files
 * that match the requested extensions and are not excluded by any pattern.
 *
 * Uses only Node's built-in `fs` module — no third-party glob library.
 *
 * ## Glob pattern semantics
 *
 * Patterns are matched against the **relative** path from `workspaceRoot`
 * (forward-slash normalised on all platforms).
 *
 * | Pattern       | Meaning                                     |
 * |---------------|---------------------------------------------|
 * | `foo`         | any path segment named exactly "foo"        |
 * | `*.beam`      | any file whose name ends with `.beam`       |
 * | `_build/**`   | everything under any `_build` directory     |
 * | `**\/test\/**`| anything inside any `test` directory        |
 *
 * A leading **\/ is implied — patterns without a "/" are tested against
 * every path segment, not just the root.
 */
export class FileDiscovery {
  /**
   * Discovers all matching files under workspaceRoot.
   * Returns absolute file paths, sorted alphabetically.
   */
  async discover(
    workspaceRoot: string,
    options: FileDiscoveryOptions,
  ): Promise<ReadonlyArray<string>> {
    const extSet =
      options.extensions.length > 0 ? new Set(options.extensions) : null;

    const maxDepth = options.maxDepth ?? Number.MAX_SAFE_INTEGER;
    const compiled = options.excludePatterns.map(compilePattern);
    const results: string[] = [];

    await this.walk(workspaceRoot, workspaceRoot, 0, maxDepth, compiled, extSet, results);

    return results.sort();
  }

  // ---------------------------------------------------------------------------
  // Private — recursive walker
  // ---------------------------------------------------------------------------

  private async walk(
    workspaceRoot: string,
    currentDir: string,
    depth: number,
    maxDepth: number,
    excludePatterns: RegExp[],
    extFilter: Set<string> | null,
    results: string[],
  ): Promise<void> {
    if (depth > maxDepth) return;

    let entries: fsSync.Dirent<string>[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      const relPath = toRelative(workspaceRoot, absPath);

      if (isExcluded(relPath, entry.name, excludePatterns)) continue;

      if (entry.isDirectory()) {
        await this.walk(
          workspaceRoot,
          absPath,
          depth + 1,
          maxDepth,
          excludePatterns,
          extFilter,
          results,
        );
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!extFilter || extFilter.has(ext)) {
          results.push(absPath);
        }
      }
      // Symlinks and other special files are intentionally skipped.
    }
  }
}

// ---------------------------------------------------------------------------
// Glob → RegExp compilation
// ---------------------------------------------------------------------------

/**
 * Compiles a single glob pattern into a RegExp that matches forward-slash
 * normalised relative paths.
 *
 * Supports: `*` (single segment), `**` (multiple segments), `?`, `[abc]`.
 */
function compilePattern(pattern: string): RegExp {
  // Normalise to forward slashes.
  const normalised = pattern.replace(/\\/g, "/");

  let regexStr = "";
  let i = 0;

  while (i < normalised.length) {
    const ch = normalised[i]!;

    if (ch === "*") {
      if (normalised[i + 1] === "*") {
        // `**` — matches any number of path segments (including zero)
        regexStr += ".*";
        i += 2;
        // Skip a trailing slash after `**` so `foo/**` matches `foo/bar`
        if (normalised[i] === "/") i++;
      } else {
        // `*` — matches anything except a path separator
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "[") {
      // Character class — pass through verbatim until `]`
      const close = normalised.indexOf("]", i);
      if (close === -1) {
        regexStr += "\\[";
        i++;
      } else {
        regexStr += normalised.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      // Escape regex metacharacters
      regexStr += ch.replace(/[.+^${}()|\\]/g, "\\$&");
      i++;
    }
  }

  // A pattern without a `/` (e.g. `*.beam`) should match any path segment,
  // not just the root, so anchor it to match anywhere in the relative path.
  const anchored = normalised.includes("/")
    ? `^${regexStr}($|/.*)`   // anchored at root
    : `(^|/)${regexStr}($|/)`; // matches any segment

  return new RegExp(anchored);
}

/**
 * Returns true when the entry should be excluded.
 * Tests both the relative path and the bare filename for each pattern.
 */
function isExcluded(relPath: string, name: string, patterns: RegExp[]): boolean {
  for (const re of patterns) {
    if (re.test(relPath) || re.test(name)) return true;
  }
  return false;
}

/**
 * Returns a forward-slash normalised path relative to `workspaceRoot`.
 */
function toRelative(workspaceRoot: string, absPath: string): string {
  return path
    .relative(workspaceRoot, absPath)
    .replace(/\\/g, "/");
}
