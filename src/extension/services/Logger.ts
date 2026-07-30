import * as vscode from "vscode";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger backed by a VS Code OutputChannel.
 *
 * All output goes to the "Code Atlas" output panel. The minimum visible
 * level is read from configuration at construction time and can be updated
 * via `setLevel()` when the user changes settings.
 */
export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.channel = vscode.window.createOutputChannel("Code Atlas");
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    this.write("debug", message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write("info", message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write("warn", message, args);
  }

  error(message: string, errorOrArgs?: unknown, ...rest: unknown[]): void {
    this.write("error", message, [errorOrArgs, ...rest]);
  }

  /** Show the output panel to the user. */
  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(level: LogLevel, message: string, args: unknown[]): void {
    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[this.level]) {
      return;
    }

    const ts = new Date().toISOString();
    const tag = level.toUpperCase().padEnd(5);
    const suffix = args
      .filter((a) => a !== undefined)
      .map((a) => {
        if (a instanceof Error) {
          return `\n  ${a.message}${a.stack ? `\n  ${a.stack}` : ""}`;
        }
        try {
          return ` ${JSON.stringify(a)}`;
        } catch {
          return ` [unserializable]`;
        }
      })
      .join("");

    this.channel.appendLine(`[${ts}] [${tag}] ${message}${suffix}`);
  }
}
