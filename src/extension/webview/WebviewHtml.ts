import * as vscode from "vscode";
import * as path from "path";

/**
 * Generates the HTML document served inside the Code Atlas webview panel.
 *
 * Responsibilities:
 * - Convert local dist paths to webview-safe URIs via `asWebviewUri`.
 * - Set a strict Content Security Policy that allows only the extension's
 *   own scripts and the VS Code webview nonce.
 * - Provide the mounting point (#root) for the React application.
 *
 * The actual React bundle is injected in Phase 3. Until then the shell
 * shows a loading indicator so the extension is functional end-to-end.
 */
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "index.js"),
  );

  const codiconsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules",
      "@vscode",
      "codicons",
      "dist",
      "codicon.css",
    ),
  );

  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'none'`,
  ].join("; ");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${codiconsUri.toString()}" rel="stylesheet" />
    <title>Code Atlas</title>
    <style>
      :root {
        --bg: var(--vscode-editor-background, #1e1e1e);
        --fg: var(--vscode-editor-foreground, #d4d4d4);
        --accent: var(--vscode-focusBorder, #007acc);
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: var(--bg);
        color: var(--fg);
        font-family: var(--vscode-font-family, system-ui, sans-serif);
        font-size: var(--vscode-font-size, 13px);
      }

      /* Loading state — replaced once React mounts */
      .ca-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 12px;
        opacity: 0.7;
      }

      .ca-loading__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--fg);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div class="ca-loading" aria-label="Loading Code Atlas" role="status">
        <div class="ca-loading__spinner" aria-hidden="true"></div>
        <span>Loading Code Atlas…</span>
      </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
}

/**
 * Generates a cryptographically random nonce for use in Content Security Policy
 * script-src directives. Uses Node's built-in crypto module.
 */
export function generateNonce(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.randomBytes(16).toString("base64");
}

/**
 * Returns the absolute path to the dist/webview directory inside the extension.
 * Used to compute asset URIs for the webview.
 */
export function getWebviewDistPath(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, "dist", "webview");
}
