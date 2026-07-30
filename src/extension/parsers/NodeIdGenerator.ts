import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// NodeIdGenerator
// ---------------------------------------------------------------------------

/**
 * Generates stable, deterministic node IDs that survive incremental rebuilds.
 *
 * ## Requirements
 *
 * - **Stable**: the same symbol at the same location must always produce the
 *   same ID, so the graph engine can diff old vs new nodes on re-parse.
 * - **Unique**: two different symbols (even with the same name in different
 *   files, or the same name at different lines) must produce different IDs.
 * - **Opaque**: the ID format is an implementation detail; callers must not
 *   parse it.
 *
 * ## Strategy
 *
 * SHA-1 hex digest over a canonical composite key:
 *
 * ```
 * <language>\0<workspaceRoot>\0<filePath>\0<module>\0<symbolName>\0<line>\0<column>
 * ```
 *
 * SHA-1 is used purely as a fast collision-resistant hash — not for
 * cryptographic purposes. The output is a 40-character hex string.
 *
 * `workspaceRoot` is included so that two projects with identical source files
 * opened simultaneously in VS Code produce disjoint ID spaces.
 */
export class NodeIdGenerator {
  constructor(private readonly workspaceRoot: string) {}

  /**
   * Generates a stable ID for a symbol definition.
   *
   * @param language    canonical language identifier ("erlang", "go", …)
   * @param filePath    absolute path of the file containing the symbol
   * @param module      module/namespace/class qualifier (may be empty string)
   * @param symbolName  the symbol's display name (function name, class name, …)
   * @param line        1-based line number of the definition
   * @param column      1-based column number of the definition
   */
  generate(
    language: string,
    filePath: string,
    module: string,
    symbolName: string,
    line: number,
    column: number,
  ): string {
    const key = [
      language,
      this.workspaceRoot,
      filePath,
      module,
      symbolName,
      String(line),
      String(column),
    ].join("\0");

    return crypto.createHash("sha1").update(key, "utf8").digest("hex");
  }

  /**
   * Generates a stable ID for an edge (relationship between two nodes).
   *
   * The edge ID is derived from the source and target node IDs plus the
   * relationship type, so the same call site always maps to the same edge.
   *
   * @param sourceNodeId  ID of the source node
   * @param targetNodeId  ID of the target node
   * @param relationshipType  canonical relationship type string
   * @param callSiteLine  1-based line of the call site (disambiguates multiple
   *                      calls from the same source to the same target)
   */
  generateEdgeId(
    sourceNodeId: string,
    targetNodeId: string,
    relationshipType: string,
    callSiteLine: number,
  ): string {
    const key = [sourceNodeId, targetNodeId, relationshipType, String(callSiteLine)].join("\0");
    return crypto.createHash("sha1").update(key, "utf8").digest("hex");
  }
}
