import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import type { Logger } from "../services/Logger";
import type { ConfigService } from "../services/ConfigService";

/**
 * Implements the `codeAtlas.clearCache` command.
 *
 * Deletes the Code Atlas cache directory (.code-atlas/ in the workspace root,
 * or the override path from configuration). Prompts for confirmation before
 * deleting to prevent accidental data loss.
 */
export class ClearCacheCommand implements vscode.Disposable {
  static readonly ID = "codeAtlas.clearCache";
  private static readonly DEFAULT_CACHE_DIR = ".code-atlas";

  private readonly registration: vscode.Disposable;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.registration = vscode.commands.registerCommand(
      ClearCacheCommand.ID,
      this.execute.bind(this),
    );
  }

  dispose(): void {
    this.registration.dispose();
  }

  private async execute(): Promise<void> {
    this.logger.info('[ClearCacheCommand] Executing "Clear Cache"');

    const cacheDir = this.resolveCacheDir();
    if (!cacheDir) {
      void vscode.window.showWarningMessage(
        "Code Atlas: No workspace folder open. Cannot locate cache directory.",
      );
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Code Atlas: Delete cache at "${cacheDir}"? The workspace will be re-indexed on next open.`,
      { modal: true },
      "Delete",
    );

    if (answer !== "Delete") {
      this.logger.debug("[ClearCacheCommand] Cancelled by user");
      return;
    }

    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
      this.logger.info("[ClearCacheCommand] Cache deleted", { cacheDir });
      void vscode.window.showInformationMessage(
        "Code Atlas: Cache cleared. The workspace will be re-indexed on next open.",
      );
    } catch (err) {
      this.logger.error("[ClearCacheCommand] Failed to delete cache", err);
      void vscode.window.showErrorMessage(
        `Code Atlas: Failed to clear cache. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private resolveCacheDir(): string | null {
    const config = this.configService.get();
    if (config.cacheDirectory) {
      return config.cacheDirectory;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const root = workspaceFolders[0];
    // Length checked above; index 0 is guaranteed to exist.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return path.join(root!.uri.fsPath, ClearCacheCommand.DEFAULT_CACHE_DIR);
  }
}
