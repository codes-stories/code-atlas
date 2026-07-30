import * as vscode from "vscode";
import type { LogLevel } from "./Logger";
import type { LayoutAlgorithm } from "../../shared/enums";

/** The validated, strongly-typed configuration snapshot for Code Atlas. */
export interface CodeAtlasConfig {
  readonly maxNodes: number;
  readonly maxEdges: number;
  readonly defaultLayout: LayoutAlgorithm;
  readonly enableIncrementalParsing: boolean;
  readonly cacheDirectory: string;
  readonly enableGitBlame: boolean;
  readonly logLevel: LogLevel;
}

const SECTION = "codeAtlas";

const LAYOUT_VALUES = new Set<string>(["dagre", "force", "radial", "tree", "horizontal", "vertical"]);
const LOG_LEVEL_VALUES = new Set<string>(["debug", "info", "warn", "error"]);

/**
 * Reads Code Atlas settings from VS Code's configuration system and
 * provides a type-safe snapshot with runtime validation.
 *
 * Consumers call `get()` to obtain the current snapshot. The service
 * fires `onDidChange` when the user edits settings so callers can react
 * without polling.
 */
export class ConfigService implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<CodeAtlasConfig>();
  private readonly listener: vscode.Disposable;

  /** Fires whenever the Code Atlas configuration section changes. */
  readonly onDidChange: vscode.Event<CodeAtlasConfig> = this.changeEmitter.event;

  constructor() {
    this.listener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        this.changeEmitter.fire(this.get());
      }
    });
  }

  /** Returns the current validated configuration snapshot. */
  get(): CodeAtlasConfig {
    const cfg = vscode.workspace.getConfiguration(SECTION);

    return {
      maxNodes: this.readPositiveInt(cfg, "maxNodes", 100_000),
      maxEdges: this.readPositiveInt(cfg, "maxEdges", 500_000),
      defaultLayout: this.readEnum(cfg, "defaultLayout", LAYOUT_VALUES, "dagre") as LayoutAlgorithm,
      enableIncrementalParsing: cfg.get<boolean>("enableIncrementalParsing") ?? true,
      cacheDirectory: cfg.get<string>("cacheDirectory") ?? "",
      enableGitBlame: cfg.get<boolean>("enableGitBlame") ?? true,
      logLevel: this.readEnum(cfg, "logLevel", LOG_LEVEL_VALUES, "info") as LogLevel,
    };
  }

  dispose(): void {
    this.listener.dispose();
    this.changeEmitter.dispose();
  }

  private readPositiveInt(
    cfg: vscode.WorkspaceConfiguration,
    key: string,
    fallback: number,
  ): number {
    const raw = cfg.get<number>(key);
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      return raw;
    }
    return fallback;
  }

  private readEnum(
    cfg: vscode.WorkspaceConfiguration,
    key: string,
    allowed: Set<string>,
    fallback: string,
  ): string {
    const raw = cfg.get<string>(key);
    if (typeof raw === "string" && allowed.has(raw)) {
      return raw;
    }
    return fallback;
  }
}
