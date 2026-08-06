import * as vscode from "vscode";
import type { ParserRegistry } from "../../shared/ParserRegistry";
import type { GraphService } from "../graph/GraphService";
import type { Logger } from "./Logger";

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

/** Called after a file's patch has been applied to the graph. */
export type FileChangedHandler = (filePath: string) => void;

// ---------------------------------------------------------------------------
// FileWatcher
// ---------------------------------------------------------------------------

/**
 * Wraps VS Code's `FileSystemWatcher` to provide incremental graph updates.
 *
 * Behaviour:
 * - **save / create** — re-parses the file and applies a `GraphMerge` patch.
 * - **delete**        — removes the file's nodes and edges from the graph.
 * - Only processes files that have a registered parser (`parserRegistry.resolve`).
 * - Debounces rapid save sequences (e.g. format-on-save) with a configurable
 *   delay so the parser doesn't run twice on a single logical edit.
 * - Calls the optional `onFileChanged` handler after each successful update so
 *   the caller can push the refreshed graph to the webview.
 *
 * Usage:
 * ```ts
 * const watcher = new FileWatcher(workspaceRoot, parserRegistry, graphService, logger);
 * watcher.onFileChanged(filePath => provider.send({ type: MessageType.GraphData, … }));
 * watcher.start();
 * context.subscriptions.push(watcher);
 * ```
 */
export class FileWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private fileChangedHandler: FileChangedHandler | null = null;

  /** Debounce window in milliseconds. */
  private readonly debounceMs: number;

  constructor(
    private readonly workspaceRoot: string,
    private readonly parserRegistry: ParserRegistry,
    private readonly graphService: GraphService,
    private readonly logger: Logger,
    debounceMs = 400,
  ) {
    this.debounceMs = debounceMs;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Registers a handler called after each successful incremental graph update.
   * Pass in a function that pushes the updated graph to the webview.
   */
  onFileChanged(handler: FileChangedHandler): void {
    this.fileChangedHandler = handler;
  }

  /**
   * Starts watching all files under the workspace root.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this.watcher) return;

    // Watch every file; filtering is done in the handlers via parserRegistry.
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, "**/*"),
      /* ignoreCreateEvents */ false,
      /* ignoreChangeEvents */ false,
      /* ignoreDeleteEvents */ false,
    );

    this.disposables.push(
      this.watcher.onDidChange((uri) => { this.scheduleReparse(uri.fsPath); }),
      this.watcher.onDidCreate((uri) => { this.scheduleReparse(uri.fsPath); }),
      this.watcher.onDidDelete((uri) => { this.handleDelete(uri.fsPath); }),
      this.watcher,
    );

    this.logger.info("[FileWatcher] Watching workspace for file changes", {
      root: this.workspaceRoot,
    });
  }

  /** Stops all watchers and clears pending debounce timers. */
  dispose(): void {
    for (const timer of this.pendingDebounce.values()) {
      clearTimeout(timer);
    }
    this.pendingDebounce.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.watcher = null;
    this.logger.debug("[FileWatcher] Disposed");
  }

  // ---------------------------------------------------------------------------
  // Private — save / create
  // ---------------------------------------------------------------------------

  private scheduleReparse(filePath: string): void {
    // Ignore files with no registered parser
    if (!this.parserRegistry.resolve(filePath)) return;

    // Cancel any pending re-parse for this file
    const existing = this.pendingDebounce.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingDebounce.delete(filePath);
      void this.reparse(filePath);
    }, this.debounceMs);

    this.pendingDebounce.set(filePath, timer);
  }

  private async reparse(filePath: string): Promise<void> {
    const parser = this.parserRegistry.resolve(filePath);
    if (!parser) return;

    this.logger.debug("[FileWatcher] Re-parsing file", { filePath });

    try {
      const content = await readFileSafe(filePath);
      const partial = await parser.parseFile({ filePath, content });

      this.graphService.applyPatch({ filePath, patch: partial });

      this.logger.info("[FileWatcher] Incremental update applied", { filePath });
      this.fileChangedHandler?.(filePath);
    } catch (err) {
      this.logger.error("[FileWatcher] Re-parse failed", { filePath, err });
    }
  }

  // ---------------------------------------------------------------------------
  // Private — delete
  // ---------------------------------------------------------------------------

  private handleDelete(filePath: string): void {
    if (!this.parserRegistry.resolve(filePath)) return;

    // Cancel any pending re-parse for the deleted file
    const existing = this.pendingDebounce.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.pendingDebounce.delete(filePath);
    }

    try {
      this.graphService.removeFile(filePath);
      this.logger.info("[FileWatcher] File removed from graph", { filePath });
      this.fileChangedHandler?.(filePath);
    } catch (err) {
      this.logger.error("[FileWatcher] removeFile failed", { filePath, err });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readFileSafe(filePath: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
