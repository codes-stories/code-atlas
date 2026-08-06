import * as fs from "fs/promises";
import type {
  LanguageParser,
  ParseFileInput,
  ParseWorkspaceInput,
  DefinitionResult,
  ReferenceResult,
  RelationshipResult,
} from "../../shared/LanguageParser";
import type { CodeGraph, GraphNode, GraphEdge, ParseDiagnostic } from "../../shared/models";
import { DiagnosticSeverity } from "../../shared/enums";
import { GraphBuilder } from "../graph/GraphBuilder";
import { NodeIdGenerator } from "./NodeIdGenerator";
import { FileDiscovery } from "./FileDiscovery";
import type { TreeSitterLoader } from "./TreeSitterLoader";

// ---------------------------------------------------------------------------
// AbstractParser
// ---------------------------------------------------------------------------

/**
 * Base class for all language parser plugins.
 *
 * Provides:
 * - `builder`          — `GraphBuilder` instance for assembling `CodeGraph`s
 * - `idGen`            — `NodeIdGenerator` bound to the workspace root
 * - `discovery`        — `FileDiscovery` for workspace file enumeration
 * - `loader`           — `TreeSitterLoader` shared across all parsers
 * - `readFile()`       — async UTF-8 file reader with error handling
 * - `parseWorkspace()` — default full-workspace implementation that calls
 *                        `parseFile()` for each discovered file and merges
 *                        the results via `GraphBuilder`
 * - `getDiagnostics()`  — default returns empty array (parsers override as needed)
 * - `getReferences()`   — default scans the graph for edges pointing at the node
 * - `getRelationships()`— default looks up edges from `GraphIndex` via the graph
 *
 * Concrete parsers must implement:
 * - `language()`
 * - `supports(filePath)`
 * - `parseFile(input)`
 * - `getDefinitions(filePath, symbolName)`
 *
 * They may optionally override `parseWorkspace()` for custom file discovery
 * logic, and `getDiagnostics()` for parse-level error reporting.
 */
export abstract class AbstractParser implements LanguageParser {
  protected readonly builder: GraphBuilder;
  protected readonly idGen: NodeIdGenerator;
  protected readonly discovery: FileDiscovery;

  constructor(
    protected readonly workspaceRoot: string,
    protected readonly loader: TreeSitterLoader,
  ) {
    this.builder = new GraphBuilder();
    this.idGen = new NodeIdGenerator(workspaceRoot);
    this.discovery = new FileDiscovery();
  }

  // ---------------------------------------------------------------------------
  // Abstract — must be implemented by every concrete parser
  // ---------------------------------------------------------------------------

  abstract language(): string;
  abstract supports(filePath: string): boolean;
  abstract parseFile(input: ParseFileInput): Promise<CodeGraph>;
  abstract getDefinitions(
    filePath: string,
    symbolName: string,
  ): Promise<ReadonlyArray<DefinitionResult>>;

  // ---------------------------------------------------------------------------
  // Default implementations
  // ---------------------------------------------------------------------------

  /**
   * Full-workspace parse: discovers all supported files, parses each one,
   * then merges the partial graphs via `GraphBuilder.build()`.
   *
   * Concrete parsers may override this for custom file discovery or for
   * cross-file resolution that requires all files to be in memory at once.
   */
  async parseWorkspace(
    input: ParseWorkspaceInput,
    onProgress?: (parsed: number, total: number, currentFile?: string) => void,
  ): Promise<CodeGraph> {
    const files =
      input.files ??
      (await this.discovery.discover(input.workspaceRoot, {
        excludePatterns: [...input.excludePatterns],
        extensions: this.supportedExtensions(),
      }));

    const supportedFiles = [...files].filter((f) => this.supports(f));
    const total = supportedFiles.length;

    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    const fileSet = new Set<string>();
    let totalParseMs = 0;
    let parsed = 0;

    for (const filePath of supportedFiles) {
      const content = await this.readFile(filePath);
      if (content === null) {
        parsed++;
        onProgress?.(parsed, total, filePath);
        continue;
      }

      const start = Date.now();
      const partial = await this.parseFile({ filePath, content });
      totalParseMs += Date.now() - start;

      for (const node of Object.values(partial.nodes)) {
        allNodes.push(node);
        fileSet.add(node.location.file);
      }
      for (const edge of Object.values(partial.edges)) {
        allEdges.push(edge);
      }

      parsed++;
      onProgress?.(parsed, total, filePath);
    }

    return this.builder.build({
      workspaceRoot: input.workspaceRoot,
      nodes: allNodes,
      edges: allEdges,
      fileCount: fileSet.size,
      parseTimeMs: totalParseMs,
    });
  }

  /**
   * Returns all references to the given node by scanning edges in the graph.
   * Concrete parsers may override for more precise cross-file resolution.
   */
  async getReferences(
    nodeId: string,
    graph: CodeGraph,
  ): Promise<ReadonlyArray<ReferenceResult>> {
    const results: ReferenceResult[] = [];

    // The node itself is a definition reference.
    const node = graph.nodes[nodeId];
    if (node) {
      results.push({
        nodeId,
        location: node.location,
        kind: "definition",
      });
    }

    // Every edge whose target is this node represents a reference.
    for (const edge of Object.values(graph.edges)) {
      if (edge.targetId === nodeId) {
        const sourceNode = graph.nodes[edge.sourceId];
        if (sourceNode) {
          results.push({
            nodeId: edge.sourceId,
            location: edge.location,
            kind: "reference",
          });
        }
      }
    }

    return results;
  }

  /**
   * Returns all relationships (edges) for the given node by scanning the graph.
   */
  async getRelationships(
    nodeId: string,
    graph: CodeGraph,
  ): Promise<RelationshipResult> {
    const outgoing: GraphEdge[] = [];
    const incoming: GraphEdge[] = [];

    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceId === nodeId) outgoing.push(edge);
      if (edge.targetId === nodeId) incoming.push(edge);
    }

    return { nodeId, outgoing, incoming };
  }

  /**
   * Default implementation returns no diagnostics.
   * Override in concrete parsers to surface parse-level errors.
   */
  async getDiagnostics(_filePath: string): Promise<ReadonlyArray<ParseDiagnostic>> {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Protected helpers for use by subclasses
  // ---------------------------------------------------------------------------

  /**
   * Reads a file as UTF-8 text.
   * Returns `null` if the file cannot be read (missing, permission error, etc.)
   * rather than throwing, so the workspace scan continues on partial failures.
   */
  protected async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  /**
   * Builds a `ParseDiagnostic` for use in `getDiagnostics()` overrides.
   */
  protected makeDiagnostic(
    filePath: string,
    line: number,
    column: number,
    message: string,
    severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ): ParseDiagnostic {
    return {
      severity,
      message,
      location: { file: filePath, line, column },
      language: this.language(),
      file: filePath,
    };
  }

  /**
   * Returns the file extensions this parser handles.
   * Used by the default `parseWorkspace()` for file discovery.
   *
   * Concrete parsers should override this to return their extension list.
   * Example: `[".erl", ".hrl"]`
   */
  protected supportedExtensions(): ReadonlyArray<string> {
    return [];
  }

  /**
   * Assembles an empty `CodeGraph` for the workspace root.
   * Useful as a no-op return value when a file has no parseable content.
   */
  protected emptyGraph(): CodeGraph {
    return this.builder.empty(this.workspaceRoot);
  }
}
