import * as vscode from "vscode";
import { IncrementalParseQueue } from "./IncrementalParseQueue";
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
 * ## Behaviour
 *
 * - **save / create** — debounces rapid saves, then enqueues a re-parse job
 *   via `IncrementalParseQueue` to ensure graph mutations are serialised.
 * - **delete** — immediately removes the file's nodes and edges from the graph.
 * - Only processes files that have a registered parser (`parserRegistry.resolve`).
 * - Tracks the **previous content** of every watched file so re-parses can
 *   supply `ParseFileInput.previousContent`, enabling parsers to diff the AST
 *   rather than reparsing from scratch.
 * - After each successful patch, asynchronously invalidates the on-disk cache
 *   by saving the updated graph (fire-and-forget, logged on error).
 * - Calls `onFileChanged` after each successful update so the caller can push
 *   the refreshed graph to the webview.
 *
 * ## Usage
 *
 * ```ts
 * const watcher = new FileWatcher(workspaceRoot, parserRegistry, graphService, logger);
 * watcher.setCacheFilePath("/workspace/.code-atlas/graph.cache.json");
 * watcher.onFileChanged(filePath => provider.send({ type: MessageType.GraphData, … }));
 * watcher.start();
 * context.subscriptions.push(watcher);
 * ```
 */
export class FileWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  /** Debounce timers keyed by file path. */
  private readonly pendingDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  /** Last known content for each file path — populated on first parse, updated after each re-parse. */
  private readonly contentCache = new Map<string, string>();

  /** Sequential queue — prevents concurrent graph mutations. */
  private readonly queue = new IncrementalParseQueue();

  /** Handler called after every successful incremental update. */
  private fileChangedHandler: FileChangedHandler | null = null;

  /** Absolute path to the on-disk cache file, or null if not configured. */
  private cacheFilePath: string | null = null;

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
   * Sets the path to the on-disk cache file.
   * When set, the watcher invalidates the cache after every successful patch.
   */
  setCacheFilePath(filePath: string): void {
    this.cacheFilePath = filePath;
  }

  /**
   * Registers a handler called after each successful incremental graph update.
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

  /** Stops all watchers, clears pending debounce timers, and clears the content cache. */
  dispose(): void {
    for (const timer of this.pendingDebounce.values()) {
      clearTimeout(timer);
    }
    this.pendingDebounce.clear();
    this.contentCache.clear();
    this.queue.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.watcher = null;
    this.logger.debug("[FileWatcher] Disposed");
  }

  // ---------------------------------------------------------------------------
  // Private — save / create
  // ---------------------------------------------------------------------------

  private scheduleReparse(filePath: string): void {
    if (!this.parserRegistry.resolve(filePath)) return;

    // Cancel any pending debounce for this path
    const existing = this.pendingDebounce.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingDebounce.delete(filePath);
      this.enqueueReparse(filePath);
    }, this.debounceMs);

    this.pendingDebounce.set(filePath, timer);
  }

  private enqueueReparse(filePath: string): void {
    this.queue.enqueue({
      label: filePath,
      execute: () => this.reparse(filePath),
    });
  }

  private async reparse(filePath: string): Promise<void> {
    const parser = this.parserRegistry.resolve(filePath);
    if (!parser) return;

    this.logger.debug("[FileWatcher] Re-parsing file", { filePath });

    const previousContent = this.contentCache.get(filePath);
    const content = await readFileSafe(filePath);

    // Skip if the file is empty and we have no record of it
    if (content === "" && previousContent === undefined) return;

    // Skip if content is identical to what we last processed
    if (content === previousContent) {
      this.logger.debug("[FileWatcher] File content unchanged, skipping re-parse", { filePath });
      return;
    }

    const partial = await parser.parseFile({
      filePath,
      content,
      ...(previousContent !== undefined ? { previousContent } : {}),
    });

    this.graphService.applyPatch({ filePath, patch: partial });

    // Update the content cache with the freshly read content
    this.contentCache.set(filePath, content);

    this.logger.info("[FileWatcher] Incremental update applied", { filePath });

    // Notify the caller (pushes graph to webview)
    this.fileChangedHandler?.(filePath);

    // Invalidate the on-disk cache asynchronously (fire-and-forget)
    void this.invalidateCache();
  }

  // ---------------------------------------------------------------------------
  // Private — delete
  // ---------------------------------------------------------------------------

  private handleDelete(filePath: string): void {
    if (!this.parserRegistry.resolve(filePath)) return;

    // Cancel any pending debounce for the deleted file
    const existing = this.pendingDebounce.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.pendingDebounce.delete(filePath);
    }

    // Also remove from content cache
    this.contentCache.delete(filePath);

    // Enqueue deletion as a serialised job so it doesn't race with a
    // pending re-parse for the same file.
    this.queue.enqueue({
      label: filePath,
      execute: async () => {
        try {
          this.graphService.removeFile(filePath);
          this.logger.info("[FileWatcher] File removed from graph", { filePath });
          this.fileChangedHandler?.(filePath);
          void this.invalidateCache();
        } catch (err) {
          this.logger.error("[FileWatcher] removeFile failed", { filePath, err });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private — cache invalidation
  // ---------------------------------------------------------------------------

  /**
   * Asynchronously persists the current graph snapshot to disk.
   * Called after every successful incremental update.
   * Failures are logged but never propagated — the in-memory graph is always
   * the source of truth.
   */
  private async invalidateCache(): Promise<void> {
    if (!this.cacheFilePath) return;

    try {
      await this.graphService.saveCache(this.cacheFilePath);
      this.logger.debug("[FileWatcher] Cache invalidated (re-saved)", {
        path: this.cacheFilePath,
      });
    } catch (err) {
      this.logger.warn("[FileWatcher] Cache invalidation failed (non-fatal)", err);
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
