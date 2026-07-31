import * as path from "path";
import type { ParseFileInput, ParseWorkspaceInput, DefinitionResult } from "../../shared/LanguageParser";
import type { CodeGraph, GraphNode, GraphEdge, SourceRange } from "../../shared/models";
import {
  NodeKind,
  EdgeKind,
  RelationshipType,
  ConditionKind,
  DiagnosticSeverity,
} from "../../shared/enums";
import { AbstractParser } from "./AbstractParser";
import { ErlangSyntaxHelper } from "./ErlangSyntaxHelper";
import type { TreeSitterLoader } from "./TreeSitterLoader";
import type { Node as SyntaxNode } from "web-tree-sitter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE = "erlang";
const EXTENSIONS = [".erl", ".hrl"];
const GRAMMAR_FILENAME = "tree-sitter-erlang.wasm";

// Default complexity for nodes where we don't compute it
const DEFAULT_COMPLEXITY = { cyclomatic: 1, cognitive: 0, loc: 0, parameters: 0 };

// ---------------------------------------------------------------------------
// Internal parse state (per file)
// ---------------------------------------------------------------------------

interface ParseState {
  filePath: string;
  source: string;
  moduleName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// ErlangParser
// ---------------------------------------------------------------------------

/**
 * Erlang language parser using the WhatsApp tree-sitter-erlang grammar.
 *
 * Extracts:
 * - Module nodes (`-module(Name).`)
 * - Function nodes (all function clauses grouped by name/arity)
 * - Call edges (local and remote `Mod:Fun(Args)`)
 * - Spawn edges (`spawn/spawn_link/spawn_monitor`)
 * - GenServer edges (`gen_server:call/cast/start_link`)
 * - ETS read/write edges (`ets:lookup/insert/delete/…`)
 */
export class ErlangParser extends AbstractParser {
  private readonly helper = new ErlangSyntaxHelper();
  private grammarPath: string;

  constructor(workspaceRoot: string, loader: TreeSitterLoader, grammarDir?: string) {
    super(workspaceRoot, loader);
    const dir = grammarDir ?? path.join(workspaceRoot, "grammars");
    this.grammarPath = path.join(dir, GRAMMAR_FILENAME);
  }

  // ---------------------------------------------------------------------------
  // LanguageParser interface
  // ---------------------------------------------------------------------------

  language(): string {
    return LANGUAGE;
  }

  supports(filePath: string): boolean {
    return EXTENSIONS.some((ext) => filePath.endsWith(ext));
  }

  protected override supportedExtensions(): ReadonlyArray<string> {
    return EXTENSIONS;
  }

  async parseWorkspace(
    input: ParseWorkspaceInput,
    onProgress?: (parsed: number, total: number) => void,
  ): Promise<CodeGraph> {
    await this.ensureGrammarLoaded();
    return super.parseWorkspace(input, onProgress);
  }

  async parseFile(input: ParseFileInput): Promise<CodeGraph> {
    await this.ensureGrammarLoaded();

    const parser = this.loader.createParser(LANGUAGE);
    const tree = parser.parse(input.content);

    if (!tree) {
      return this.emptyGraph();
    }

    const state: ParseState = {
      filePath: input.filePath,
      source: input.content,
      moduleName: "",
      nodes: [],
      edges: [],
    };

    this.extractModule(tree.rootNode, state);
    this.extractFunctions(tree.rootNode, state);
    this.extractEdges(tree.rootNode, state);

    tree.delete();

    return this.builder.build({
      workspaceRoot: this.workspaceRoot,
      nodes: state.nodes,
      edges: state.edges,
      fileCount: 1,
      parseTimeMs: 0,
    });
  }

  async getDefinitions(filePath: string, symbolName: string): Promise<ReadonlyArray<DefinitionResult>> {
    const content = await this.readFile(filePath);
    if (!content) return [];

    await this.ensureGrammarLoaded();
    const parser = this.loader.createParser(LANGUAGE);
    const tree = parser.parse(content);
    if (!tree) return [];

    const results: DefinitionResult[] = [];
    const state: ParseState = { filePath, source: content, moduleName: "", nodes: [], edges: [] };
    this.extractModule(tree.rootNode, state);
    this.extractFunctions(tree.rootNode, state);
    tree.delete();

    for (const node of state.nodes) {
      if (node.displayName === symbolName || `${node.module}:${node.displayName}` === symbolName) {
        results.push({ node, location: node.location });
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Private — module extraction
  // ---------------------------------------------------------------------------

  private extractModule(root: SyntaxNode, state: ParseState): void {
    const modAttr = this.helper.firstDescendant(root, "module_attribute");
    if (!modAttr) return;

    const name = this.helper.moduleNameFromAttribute(modAttr);
    if (!name) return;
    state.moduleName = name;

    const nodeId = this.idGen.generate(
      LANGUAGE, state.filePath, "", name, modAttr.startPosition.row + 1, 1,
    );

    const loc = this.helper.startLocation(modAttr, state.filePath);
    const endLoc = this.helper.endLocation(modAttr, state.filePath);

    const moduleNode: GraphNode = {
      id: nodeId,
      displayName: name,
      language: LANGUAGE,
      kind: NodeKind.Module,
      module: name,
      signature: `-module(${name}).`,
      location: loc,
      range: { start: loc, end: endLoc },
      documentation: "",
      complexity: DEFAULT_COMPLEXITY,
      incomingEdgeIds: [],
      outgoingEdgeIds: [],
      gitBlame: null,
      metadata: {},
    };

    state.nodes.push(moduleNode);
  }

  // ---------------------------------------------------------------------------
  // Private — function extraction
  // ---------------------------------------------------------------------------

  private extractFunctions(root: SyntaxNode, state: ParseState): void {
    const funDecls = this.helper.descendants(root, "fun_decl");

    for (const decl of funDecls) {
      const clauses = this.helper.childrenOfType(decl, "function_clause");
      if (clauses.length === 0) continue;

      const firstClause = clauses[0]!;
      const { name, arity } = this.helper.functionClauseSignature(firstClause);
      if (!name) continue;

      const loc = this.helper.startLocation(firstClause, state.filePath);
      const lastClause = clauses[clauses.length - 1]!;
      const endLoc = this.helper.endLocation(lastClause, state.filePath);

      const range: SourceRange = { start: loc, end: endLoc };
      const signature = `${name}/${arity}`;
      const doc = this.helper.extractDocComment(firstClause, state.source);
      const loc_count = endLoc.line - loc.line + 1;
      const cyclomatic = this.computeCyclomatic(decl);

      const nodeId = this.idGen.generate(
        LANGUAGE, state.filePath, state.moduleName, signature, loc.line, loc.column,
      );

      const funcNode: GraphNode = {
        id: nodeId,
        displayName: name,
        language: LANGUAGE,
        kind: NodeKind.Function,
        module: state.moduleName,
        signature,
        location: loc,
        range,
        documentation: doc,
        complexity: { cyclomatic, cognitive: 0, loc: loc_count, parameters: arity },
        incomingEdgeIds: [],
        outgoingEdgeIds: [],
        gitBlame: null,
        metadata: { arity },
      };

      state.nodes.push(funcNode);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — edge extraction
  // ---------------------------------------------------------------------------

  private extractEdges(root: SyntaxNode, state: ParseState): void {
    const calls = this.helper.descendants(root, "call");

    for (const call of calls) {
      const target = this.helper.callTarget(call);
      if (!target) continue;

      const callLoc = this.helper.startLocation(call, state.filePath);
      const sourceNode = this.findEnclosingFunction(call, state);
      if (!sourceNode) continue;

      if (this.helper.isSpawnCall(call)) {
        this.addSpawnEdge(call, target, sourceNode, callLoc, state);
      } else if (this.helper.isGenServerCall(call)) {
        this.addGenServerEdge(call, target, sourceNode, callLoc, state);
      } else if (this.helper.isEtsCall(call)) {
        this.addEtsEdge(call, target, sourceNode, callLoc, state);
      } else {
        this.addCallEdge(target, sourceNode, callLoc, state);
      }
    }
  }

  private addCallEdge(
    target: { module: string; name: string; arity: number },
    sourceNode: GraphNode,
    callLoc: ReturnType<ErlangSyntaxHelper["startLocation"]>,
    state: ParseState,
  ): void {
    const targetModule = target.module || state.moduleName;
    const targetSig = `${target.name}/${target.arity}`;

    // Find the target node in the same file (cross-file resolution is Phase 8)
    const targetNode = state.nodes.find(
      (n) =>
        n.kind === NodeKind.Function &&
        n.displayName === target.name &&
        n.metadata["arity"] === target.arity &&
        (target.module === "" || n.module === targetModule),
    );

    if (!targetNode) return; // cross-file — skip for now, resolved in Phase 8

    const edgeId = this.idGen.generateEdgeId(
      sourceNode.id, targetNode.id, RelationshipType.FunctionCall, callLoc.line,
    );

    const edge: GraphEdge = {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: targetNode.id,
      kind: EdgeKind.Call,
      relationshipType: RelationshipType.FunctionCall,
      location: callLoc,
      sourceCode: `${targetModule}:${targetSig}`,
      reason: "",
      conditionKind: ConditionKind.Unconditional,
      conditionExpression: "",
      examples: [],
      metadata: {},
    };
    state.edges.push(edge);
  }

  private addSpawnEdge(
    call: SyntaxNode,
    target: { module: string; name: string; arity: number },
    sourceNode: GraphNode,
    callLoc: ReturnType<ErlangSyntaxHelper["startLocation"]>,
    state: ParseState,
  ): void {
    // spawn(Module, Fun, Args) — the spawned target is the 2nd arg
    const argsNode = call.childForFieldName("args");
    const spawnedModule = argsNode?.namedChild(0)?.text ?? target.module;
    const spawnedFun = argsNode?.namedChild(1)?.text ?? "";
    const spawnedArity = argsNode?.namedChild(2)?.namedChildCount ?? 0;

    const targetNode = state.nodes.find(
      (n) =>
        n.kind === NodeKind.Function &&
        n.displayName === spawnedFun &&
        (spawnedModule === "" || n.module === spawnedModule),
    );
    if (!targetNode) return;

    const edgeId = this.idGen.generateEdgeId(
      sourceNode.id, targetNode.id, RelationshipType.Spawn, callLoc.line,
    );

    const edge: GraphEdge = {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: targetNode.id,
      kind: EdgeKind.Spawn,
      relationshipType: RelationshipType.Spawn,
      location: callLoc,
      sourceCode: call.text.slice(0, 80),
      reason: "spawn/spawn_link",
      conditionKind: ConditionKind.Spawn,
      conditionExpression: "",
      examples: [],
      metadata: { spawnedArity },
    };
    state.edges.push(edge);
  }

  private addGenServerEdge(
    call: SyntaxNode,
    target: { module: string; name: string; arity: number },
    sourceNode: GraphNode,
    callLoc: ReturnType<ErlangSyntaxHelper["startLocation"]>,
    state: ParseState,
  ): void {
    const relType =
      target.name === "start_link" ? RelationshipType.FunctionCall : RelationshipType.Rpc;

    const edgeId = this.idGen.generateEdgeId(
      sourceNode.id, `gen_server:${target.name}`, relType, callLoc.line,
    );

    // Find handle_call/handle_cast in the same module as target node
    const targetNode = state.nodes.find(
      (n) =>
        n.kind === NodeKind.Function &&
        (n.displayName === "handle_call" || n.displayName === "handle_cast"),
    );

    const actualTargetId = targetNode?.id ?? `external:gen_server:${target.name}`;
    const edge: GraphEdge = {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: actualTargetId,
      kind: EdgeKind.Call,
      relationshipType: relType,
      location: callLoc,
      sourceCode: call.text.slice(0, 80),
      reason: `gen_server:${target.name}/2`,
      conditionKind: ConditionKind.Unconditional,
      conditionExpression: "",
      examples: [],
      metadata: { genServerOp: target.name },
    };

    // Only add edge when we have a real target node to avoid dangling edges
    if (targetNode) {
      state.edges.push(edge);
    }
  }

  private addEtsEdge(
    call: SyntaxNode,
    target: { module: string; name: string; arity: number },
    sourceNode: GraphNode,
    callLoc: ReturnType<ErlangSyntaxHelper["startLocation"]>,
    state: ParseState,
  ): void {
    const writeOps = new Set(["insert", "insert_new", "delete", "delete_all_objects", "update_element", "update_counter"]);
    const isWrite = writeOps.has(target.name);

    const edgeId = this.idGen.generateEdgeId(
      sourceNode.id, `ets:${target.name}`, isWrite ? RelationshipType.DatabaseQuery : RelationshipType.CacheAccess, callLoc.line,
    );

    // Find an ETS table node if we can identify it from the args
    const argsNode = call.childForFieldName("args");
    const tableRef = argsNode?.namedChild(0)?.text ?? "unknown";

    const etsTableNode = state.nodes.find(
      (n) => n.kind === NodeKind.EtsTable && n.displayName === tableRef,
    );

    if (!etsTableNode) return; // no table node defined — skip dangling edge

    const edge: GraphEdge = {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: etsTableNode.id,
      kind: isWrite ? EdgeKind.Writes : EdgeKind.Reads,
      relationshipType: isWrite ? RelationshipType.DatabaseQuery : RelationshipType.CacheAccess,
      location: callLoc,
      sourceCode: call.text.slice(0, 80),
      reason: `ets:${target.name}`,
      conditionKind: ConditionKind.Unconditional,
      conditionExpression: "",
      examples: [],
      metadata: { etsOp: target.name, tableRef },
    };
    state.edges.push(edge);
  }

  // ---------------------------------------------------------------------------
  // Private — helpers
  // ---------------------------------------------------------------------------

  /**
   * Finds the GraphNode for the function that encloses the given syntax node.
   */
  private findEnclosingFunction(node: SyntaxNode, state: ParseState): GraphNode | null {
    let cursor: SyntaxNode | null = node.parent;
    while (cursor) {
      if (cursor.type === "fun_decl") {
        const clauses = this.helper.childrenOfType(cursor, "function_clause");
        if (clauses.length === 0) return null;
        const { name, arity } = this.helper.functionClauseSignature(clauses[0]!);
        const sig = `${name}/${arity}`;
        return state.nodes.find((n) => n.kind === NodeKind.Function && n.signature === sig) ?? null;
      }
      cursor = cursor.parent;
    }
    return null;
  }

  /**
   * Estimates cyclomatic complexity by counting branching constructs.
   */
  private computeCyclomatic(decl: SyntaxNode): number {
    let count = 1;
    const branchTypes = ["if_clause", "case_clause", "catch_clause", "cr_clause", "guard_clause"];
    for (const type of branchTypes) {
      count += this.helper.descendants(decl, type).length;
    }
    return count;
  }

  private async ensureGrammarLoaded(): Promise<void> {
    if (this.loader.getLanguage(LANGUAGE)) return;
    await this.loader.loadLanguage({ language: LANGUAGE, wasmPath: this.grammarPath });
  }
}
