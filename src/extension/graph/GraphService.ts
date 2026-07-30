import type { CodeGraph, GraphNode, GraphEdge } from "../../shared/models";
import { GraphBuilder } from "./GraphBuilder";
import { GraphIndex } from "./GraphIndex";
import { GraphQuery, type NeighbourhoodOptions, type PathOptions } from "./GraphQuery";
import type { NeighbourhoodResult, GraphPath, CycleResult } from "./GraphQuery";
import { GraphMerge, type FilePatchInput } from "./GraphMerge";
import {
  GraphSerializer,
  CacheNotFoundError,
  CacheVersionError,
  CacheChecksumError,
} from "./GraphSerializer";
import type { Logger } from "../services/Logger";
import type { NodeRef } from "./GraphIndex";
import type { NodeKind, EdgeKind } from "../../shared/enums";

// ---------------------------------------------------------------------------
// GraphService
// ---------------------------------------------------------------------------

/**
 * The single graph facade consumed by commands, the webview provider, and
 * the workspace indexer.
 *
 * Responsibilities:
 * - Holds the current graph snapshot and its derived index + query engine.
 * - Exposes mutation operations (setGraph, applyPatch, removeFile) that keep
 *   the index in sync automatically.
 * - Delegates cache I/O to `GraphSerializer`.
 * - Never exposes the internal `GraphBuilder` / `GraphIndex` / `GraphQuery`
 *   instances directly — all operations go through this façade.
 */
export class GraphService {
  private graph: CodeGraph;
  private index: GraphIndex;
  private query: GraphQuery;

  private readonly builder = new GraphBuilder();
  private readonly merger = new GraphMerge();
  private readonly serializer = new GraphSerializer();

  constructor(
    workspaceRoot: string,
    private readonly logger: Logger,
  ) {
    this.graph = this.builder.empty(workspaceRoot);
    this.index = new GraphIndex(this.graph);
    this.query = new GraphQuery(this.graph, this.index);
  }

  // ---------------------------------------------------------------------------
  // Graph snapshot
  // ---------------------------------------------------------------------------

  /** Returns the current immutable graph snapshot. */
  getGraph(): CodeGraph {
    return this.graph;
  }

  /**
   * Replaces the current graph with a freshly built one and rebuilds the
   * index + query engine. Called after a full workspace parse completes.
   */
  setGraph(graph: CodeGraph): void {
    this.graph = graph;
    this.rebuildIndex();
    this.logger.info("[GraphService] Graph updated", {
      nodes: Object.keys(graph.nodes).length,
      edges: Object.keys(graph.edges).length,
      languages: graph.languages,
    });
  }

  // ---------------------------------------------------------------------------
  // Incremental updates
  // ---------------------------------------------------------------------------

  /**
   * Applies a single-file incremental patch to the current graph.
   * Rebuilds the index after the merge.
   */
  applyPatch(patch: FilePatchInput): void {
    this.graph = this.merger.applyFilePatch(this.graph, patch);
    this.rebuildIndex();
    this.logger.debug("[GraphService] Applied file patch", { file: patch.filePath });
  }

  /**
   * Removes all nodes and edges belonging to `filePath`.
   * Used when a file is deleted from the workspace.
   */
  removeFile(filePath: string): void {
    this.graph = this.merger.removeFile(this.graph, filePath);
    this.rebuildIndex();
    this.logger.debug("[GraphService] Removed file from graph", { file: filePath });
  }

  // ---------------------------------------------------------------------------
  // Node / edge accessors
  // ---------------------------------------------------------------------------

  getNode(nodeId: string): GraphNode | undefined {
    return this.graph.nodes[nodeId];
  }

  getEdge(edgeId: string): GraphEdge | undefined {
    return this.graph.edges[edgeId];
  }

  getIncomingEdges(nodeId: string): ReadonlyArray<GraphEdge> {
    return this.index.incomingEdges(nodeId);
  }

  getOutgoingEdges(nodeId: string): ReadonlyArray<GraphEdge> {
    return this.index.outgoingEdges(nodeId);
  }

  // ---------------------------------------------------------------------------
  // Index queries
  // ---------------------------------------------------------------------------

  searchByName(query: string, limit?: number): ReadonlyArray<NodeRef> {
    return this.index.searchByName(query, limit);
  }

  nodesInFile(filePath: string): ReadonlyArray<string> {
    return this.index.nodesInFile(filePath);
  }

  nodesInModule(module: string): ReadonlyArray<string> {
    return this.index.nodesInModule(module);
  }

  nodesOfKind(kind: NodeKind): ReadonlyArray<string> {
    return this.index.nodesOfKind(kind);
  }

  nodesForLanguage(language: string): ReadonlyArray<string> {
    return this.index.nodesForLanguage(language);
  }

  allFiles(): ReadonlyArray<string> {
    return this.index.allFiles();
  }

  allModules(): ReadonlyArray<string> {
    return this.index.allModules();
  }

  // ---------------------------------------------------------------------------
  // Graph queries
  // ---------------------------------------------------------------------------

  neighbourhood(nodeId: string, options?: NeighbourhoodOptions): NeighbourhoodResult | null {
    return this.query.neighbourhood(nodeId, options);
  }

  shortestPath(
    sourceId: string,
    targetId: string,
    options?: PathOptions,
  ): GraphPath | null {
    return this.query.shortestPath(sourceId, targetId, options);
  }

  allPaths(
    sourceId: string,
    targetId: string,
    options?: PathOptions,
  ): ReadonlyArray<GraphPath> {
    return this.query.allPaths(sourceId, targetId, options);
  }

  detectCycles(startId: string, maxCycles?: number): ReadonlyArray<CycleResult> {
    return this.query.detectCycles(startId, maxCycles);
  }

  edgesOfKind(kind: EdgeKind): ReadonlyArray<string> {
    return this.index.edgesOfKind(kind);
  }

  // ---------------------------------------------------------------------------
  // Cache I/O
  // ---------------------------------------------------------------------------

  /**
   * Saves the current graph to the given cache file path.
   * Writes atomically via a temporary file.
   */
  async saveCache(filePath: string): Promise<void> {
    this.logger.debug("[GraphService] Saving cache", { filePath });
    await this.serializer.saveSafe(this.graph, filePath);
    this.logger.info("[GraphService] Cache saved", { filePath });
  }

  /**
   * Loads a graph from cache and sets it as the current graph.
   *
   * Returns true when the cache was loaded successfully.
   * Returns false when the cache is absent, stale, or corrupt —
   * in these cases the current graph is left unchanged.
   */
  async loadCache(filePath: string): Promise<boolean> {
    try {
      const cached = await this.serializer.load(filePath);
      this.setGraph(cached);
      this.logger.info("[GraphService] Cache loaded", { filePath });
      return true;
    } catch (err) {
      if (
        err instanceof CacheNotFoundError ||
        err instanceof CacheVersionError ||
        err instanceof CacheChecksumError
      ) {
        this.logger.info("[GraphService] Cache miss or invalid", {
          reason: (err as Error).message,
        });
        return false;
      }
      this.logger.warn("[GraphService] Unexpected cache load error", err);
      return false;
    }
  }

  async cacheExists(filePath: string): Promise<boolean> {
    return this.serializer.exists(filePath);
  }

  async removeCache(filePath: string): Promise<void> {
    await this.serializer.remove(filePath);
    this.logger.info("[GraphService] Cache removed", { filePath });
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  get nodeCount(): number {
    return this.index.nodeCount;
  }

  get edgeCount(): number {
    return this.index.edgeCount;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private rebuildIndex(): void {
    this.index = new GraphIndex(this.graph);
    this.query = new GraphQuery(this.graph, this.index);
  }
}
