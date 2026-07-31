import type { Node as SyntaxNode } from "web-tree-sitter";

// ---------------------------------------------------------------------------
// ErlangSyntaxHelper
// ---------------------------------------------------------------------------

/**
 * Stateless helpers for traversing the web-tree-sitter AST produced by the
 * WhatsApp Erlang grammar.
 *
 * All methods are pure functions that take a SyntaxNode and return derived
 * values. Nothing is mutated; nothing is stored.
 */
export class ErlangSyntaxHelper {
  // ---------------------------------------------------------------------------
  // Text extraction
  // ---------------------------------------------------------------------------

  /** Returns the verbatim source text of a node. */
  text(node: SyntaxNode): string {
    return node.text;
  }

  /**
   * Returns the text of the first named child with the given field name,
   * or an empty string when the field is absent.
   */
  fieldText(node: SyntaxNode, fieldName: string): string {
    const child = node.childForFieldName(fieldName);
    return child ? child.text : "";
  }

  /**
   * Returns the unquoted atom text.
   * Erlang atoms may be quoted: `'some atom'` → `some atom`.
   */
  atomText(node: SyntaxNode): string {
    const raw = node.text;
    if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  // ---------------------------------------------------------------------------
  // Child collection
  // ---------------------------------------------------------------------------

  /**
   * Returns all named children of the given node whose type matches
   * one of the provided types.
   */
  childrenOfType(node: SyntaxNode, ...types: string[]): SyntaxNode[] {
    const typeSet = new Set(types);
    const results: SyntaxNode[] = [];
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child && typeSet.has(child.type)) {
        results.push(child);
      }
    }
    return results;
  }

  /**
   * Returns all descendants (at any depth) matching the given type.
   * Uses iterative DFS to avoid stack overflows on deeply nested trees.
   */
  descendants(root: SyntaxNode, type: string): SyntaxNode[] {
    const results: SyntaxNode[] = [];
    const stack: SyntaxNode[] = [root];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.type === type) results.push(node);
      for (let i = node.namedChildCount - 1; i >= 0; i--) {
        const child = node.namedChild(i);
        if (child) stack.push(child);
      }
    }
    return results;
  }

  /**
   * Returns the first descendant matching the given type, or null.
   */
  firstDescendant(root: SyntaxNode, type: string): SyntaxNode | null {
    const stack: SyntaxNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.type === type) return node;
      for (let i = node.namedChildCount - 1; i >= 0; i--) {
        const child = node.namedChild(i);
        if (child) stack.push(child);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Erlang-specific extractors
  // ---------------------------------------------------------------------------

  /**
   * Extracts the module name from a `module_attribute` node.
   * e.g. `-module(my_server).` → `"my_server"`
   */
  moduleNameFromAttribute(node: SyntaxNode): string {
    const nameNode = node.childForFieldName("name");
    return nameNode ? this.atomText(nameNode) : "";
  }

  /**
   * Extracts the function name and arity from a `function_clause` node.
   * Returns `{ name, arity }` where arity is the number of argument patterns.
   */
  functionClauseSignature(clause: SyntaxNode): { name: string; arity: number } {
    const nameNode = clause.childForFieldName("name");
    const argsNode = clause.childForFieldName("args");
    const name = nameNode ? this.atomText(nameNode) : "";
    const arity = argsNode ? argsNode.namedChildCount : 0;
    return { name, arity };
  }

  /**
   * Extracts the target of a `call` node.
   *
   * Returns:
   * - `{ module: "", name, arity }` for a local call  `foo(A, B)`
   * - `{ module, name, arity }`     for a remote call  `mod:foo(A, B)`
   * - `null` when the call target cannot be statically determined
   *   (e.g. `Fun(A)` where `Fun` is a variable).
   */
  callTarget(
    call: SyntaxNode,
  ): { module: string; name: string; arity: number } | null {
    const exprNode = call.childForFieldName("expr");
    const argsNode = call.childForFieldName("args");
    const arity = argsNode ? argsNode.namedChildCount : 0;

    if (!exprNode) return null;

    if (exprNode.type === "remote") {
      const modNode = exprNode.childForFieldName("module");
      const funNode = exprNode.childForFieldName("fun");
      if (!modNode || !funNode) return null;
      // Only resolve static atoms — skip variable-based dispatches.
      if (modNode.type !== "atom" || funNode.type !== "atom") return null;
      return {
        module: this.atomText(modNode),
        name: this.atomText(funNode),
        arity,
      };
    }

    if (exprNode.type === "atom") {
      return { module: "", name: this.atomText(exprNode), arity };
    }

    return null; // dynamic call — cannot resolve statically
  }

  /**
   * Returns true when the call node represents a `spawn` or `spawn_link`
   * BIF call: `spawn(Module, Fun, Args)` or `spawn(fun() -> … end)`.
   */
  isSpawnCall(call: SyntaxNode): boolean {
    const target = this.callTarget(call);
    if (!target) return false;
    const { module, name } = target;
    const spawnNames = new Set(["spawn", "spawn_link", "spawn_monitor", "spawn_opt"]);
    return (module === "" || module === "erlang") && spawnNames.has(name);
  }

  /**
   * Returns true when the call looks like a `gen_server:call` or
   * `gen_server:cast`.
   */
  isGenServerCall(call: SyntaxNode): boolean {
    const target = this.callTarget(call);
    if (!target) return false;
    return (
      target.module === "gen_server" &&
      (target.name === "call" || target.name === "cast" || target.name === "start_link")
    );
  }

  /**
   * Returns true when the call looks like an ETS operation.
   */
  isEtsCall(call: SyntaxNode): boolean {
    const target = this.callTarget(call);
    if (!target) return false;
    return target.module === "ets";
  }

  // ---------------------------------------------------------------------------
  // Location helpers
  // ---------------------------------------------------------------------------

  /** Converts tree-sitter's 0-based row/column to 1-based line/column. */
  startLocation(node: SyntaxNode, filePath: string) {
    return {
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
    };
  }

  endLocation(node: SyntaxNode, filePath: string) {
    return {
      file: filePath,
      line: node.endPosition.row + 1,
      column: node.endPosition.column + 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Doc comment extraction
  // ---------------------------------------------------------------------------

  /**
   * Extracts doc comments immediately preceding the given node.
   * Erlang uses `%% doc` convention — collects consecutive `%%` comment lines
   * that sit directly above the node.
   */
  extractDocComment(node: SyntaxNode, source: string): string {
    const startLine = node.startPosition.row; // 0-based
    if (startLine === 0) return "";

    const lines = source.split("\n");
    const docLines: string[] = [];

    for (let i = startLine - 1; i >= 0; i--) {
      const line = (lines[i] ?? "").trim();
      if (line.startsWith("%%")) {
        // Strip leading %% and optional space
        docLines.unshift(line.replace(/^%%+\s?/, ""));
      } else if (line === "" && docLines.length === 0) {
        continue; // skip blank lines before doc block starts
      } else {
        break;
      }
    }

    return docLines.join("\n").trim();
  }
}
