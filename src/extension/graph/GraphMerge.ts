import type { CodeGraph, GraphNode, GraphEdge } from "../../shared/models";
import { GraphBuilder } from "./GraphBuilder";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Merge strategy
// ---------------------------------------------------------------------------

/**
 * Describes what changed in a single file during an incremental re-parse.
 */
export interface FilePatchInput {
  /** Absolute path of the file that was re-parsed. */
  readonly filePath: string;

  /**
   * Partial graph produced by re-parsing this one file.
   * Contains only the nodes and edges found in `filePath`.
   */
  readonly patch: CodeGraph;
}

// ---------------------------------------------------------------------------
// GraphMerge
// ---------------------------------------------------------------------------

/**
 * Merges partial graphs produced by incremental file re-parses into a
 * complete workspace graph.
 *
 * ## Merge algorithm
 *
 * 1. **Remove stale data** — drop every node whose `location.file` matches
 *    `filePath`, and every edge that references one of those nodes as either
 *    source or target.
 * 2. **Insert fresh data** — add all nodes and edges from the patch.
 * 3. **Re-wire edge arrays** — delegate to `GraphBuilder.build()` which
 *    recomputes `incomingEdgeIds` / `outgoingEdgeIds` for affected nodes.
 * 4. **Recompute metadata** — update `languages`, `fileCount`, `builtAt`.
 *
 * The original `base` graph is never mutated. The returned graph is a new
 * immutable snapshot.
 */
export class GraphMerge {
  private readonly builder = new GraphBuilder();

  /**
   * Applies a single-file patch to the base graph.
   */
  applyFilePatch(base: CodeGraph, patch: FilePatchInput): CodeGraph {
    const { filePath } = patch;

    // -----------------------------------------------------------------------
    // 1. Collect stale node ids from the file being replaced.
    // -----------------------------------------------------------------------
    const staleNodeIds = new Set<string>();
    for (const node of Object.values(base.nodes)) {
      if (node.location.file === filePath) {
        staleNodeIds.add(node.id);
      }
    }

    // -----------------------------------------------------------------------
    // 2. Build the surviving node/edge collections (without stale data).
    // -----------------------------------------------------------------------
    const survivingNodes: GraphNode[] = [];
    for (const node of Object.values(base.nodes)) {
      if (!staleNodeIds.has(node.id)) {
        survivingNodes.push(node);
      }
    }

    const survivingEdges: GraphEdge[] = [];
    for (const edge of Object.values(base.edges)) {
      if (staleNodeIds.has(edge.sourceId) || staleNodeIds.has(edge.targetId)) {
        continue;
      }
      survivingEdges.push(edge);
    }

    // -----------------------------------------------------------------------
    // 3. Merge in the patch nodes and edges.
    // -----------------------------------------------------------------------
    const mergedNodes = [
      ...survivingNodes,
      ...Object.values(patch.patch.nodes),
    ];
    const mergedEdges = [
      ...survivingEdges,
      ...Object.values(patch.patch.edges),
    ];

    // -----------------------------------------------------------------------
    // 4. Recompute file count.
    //    - If the file was unknown (no stale nodes) AND the patch adds nodes,
    //      increment by 1 (new file).
    //    - If the file was known (stale nodes existed) AND the patch is empty,
    //      decrement is handled by removeFile() — here we keep the count.
    //    - Otherwise the count is unchanged.
    // -----------------------------------------------------------------------
    const patchHasNodes = Object.keys(patch.patch.nodes).length > 0;
    const fileCountDelta = staleNodeIds.size === 0 && patchHasNodes ? 1 : 0;

    // -----------------------------------------------------------------------
    // 5. Rebuild via GraphBuilder to re-wire all edge arrays and collect
    //    updated language set.
    // -----------------------------------------------------------------------
    return this.builder.build({
      workspaceRoot: base.workspaceRoot,
      nodes: mergedNodes,
      edges: mergedEdges,
      fileCount: base.fileCount + fileCountDelta,
      parseTimeMs: base.parseTimeMs,
    });
  }

  /**
   * Removes all nodes and edges from the given file from the base graph.
   * Used when a file is deleted from the workspace.
   */
  removeFile(base: CodeGraph, filePath: string): CodeGraph {
    const emptyPatch: CodeGraph = {
      id: randomUUID(),
      builtAt: new Date().toISOString(),
      workspaceRoot: base.workspaceRoot,
      nodes: {},
      edges: {},
      languages: [],
      fileCount: 0,
      parseTimeMs: 0,
    };

    const hasFile = Object.values(base.nodes).some(
      (n) => n.location.file === filePath,
    );

    const result = this.applyFilePatch(base, {
      filePath,
      patch: emptyPatch,
    });

    // Decrement fileCount when a known file is removed.
    if (hasFile && result.fileCount > 0) {
      return { ...result, fileCount: result.fileCount - 1 };
    }
    return result;
  }

  /**
   * Merges multiple partial graphs (e.g., from a full workspace scan that
   * ran parsers in parallel) into a single unified graph.
   *
   * Later entries in the array take precedence on id collisions.
   */
  mergeAll(workspaceRoot: string, partials: ReadonlyArray<CodeGraph>): CodeGraph {
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    let totalParseTimeMs = 0;
    const fileSet = new Set<string>();

    for (const partial of partials) {
      totalParseTimeMs += partial.parseTimeMs;
      for (const node of Object.values(partial.nodes)) {
        allNodes.push(node);
        fileSet.add(node.location.file);
      }
      for (const edge of Object.values(partial.edges)) {
        allEdges.push(edge);
      }
    }

    return this.builder.build({
      workspaceRoot,
      nodes: allNodes,
      edges: allEdges,
      fileCount: fileSet.size,
      parseTimeMs: totalParseTimeMs,
    });
  }
}
