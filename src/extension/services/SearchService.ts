import * as vscode from "vscode";
import type { GraphService } from "../graph/GraphService";
import type { Logger } from "./Logger";

// ---------------------------------------------------------------------------
// SearchResult
// ---------------------------------------------------------------------------

/**
 * Lightweight result shape returned by SearchService.
 * Mirrors NodeRef from GraphIndex but uses `string` for `kind` so it can
 * be sent across the message boundary without importing extension-only enums.
 */
export interface SearchResult {
  readonly id: string;
  readonly displayName: string;
  readonly language: string;
  readonly kind: string;
  readonly file: string;
  readonly module: string;
}

// ---------------------------------------------------------------------------
// SearchService
// ---------------------------------------------------------------------------

/**
 * Provides symbol search over the current graph.
 *
 * Two query modes:
 * - **Regex** — query starts with `/`; the remainder is treated as a
 *   JavaScript regex (flags `i` applied automatically).
 * - **Substring** — any other query; matched case-insensitively against
 *   `displayName`, `module`, and the basename of `file`.
 *
 * Results are capped at `limit` (default 50).
 */
export class SearchService implements vscode.Disposable {
  constructor(
    private readonly graphService: GraphService,
    private readonly logger: Logger,
  ) {}

  /**
   * Searches the current graph for nodes matching `rawQuery`.
   *
   * @param rawQuery - The search string. Prefix with `/` for regex mode.
   * @param limit    - Maximum number of results to return.
   */
  search(rawQuery: string, limit = 50): SearchResult[] {
    const trimmed = rawQuery.trim();
    if (trimmed.length === 0) {
      return [];
    }

    this.logger.debug("[SearchService] search", { query: trimmed, limit });

    // Build a predicate based on query mode.
    const predicate = this.buildPredicate(trimmed);

    // GraphService.searchByName performs a substring index scan — use it
    // as a fast pre-filter, then apply our own predicate for regex mode.
    // For regex queries pass an empty string to get all nodes, then filter.
    const refs = this.graphService.searchByName(trimmed.startsWith("/") ? "" : trimmed, limit * 4);

    const results: SearchResult[] = [];

    for (const ref of refs) {
      if (results.length >= limit) break;

      if (predicate(ref.displayName, ref.module, ref.file)) {
        results.push({
          id: ref.id,
          displayName: ref.displayName,
          language: ref.language,
          kind: String(ref.kind),
          file: ref.file,
          module: ref.module,
        });
      }
    }

    this.logger.debug("[SearchService] results", { count: results.length });
    return results;
  }

  dispose(): void {
    // No resources to release.
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private buildPredicate(
    query: string,
  ): (displayName: string, module: string, file: string) => boolean {
    if (query.startsWith("/")) {
      // Regex mode — strip leading slash; catch invalid patterns gracefully.
      const pattern = query.slice(1);
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "i");
      } catch {
        this.logger.warn("[SearchService] Invalid regex, falling back to substring", { pattern });
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(escaped, "i");
      }
      return (displayName, module, file) =>
        regex.test(displayName) || regex.test(module) || regex.test(file);
    }

    // Substring mode — case-insensitive containment check.
    const lower = query.toLowerCase();
    return (displayName, module, file) => {
      const base = file.split("/").pop() ?? file;
      return (
        displayName.toLowerCase().includes(lower) ||
        module.toLowerCase().includes(lower) ||
        base.toLowerCase().includes(lower)
      );
    };
  }
}
