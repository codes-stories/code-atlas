/**
 * Injects all Code Atlas graph component styles as a single <style> block
 * into the document head. Called once from index.tsx before React mounts.
 *
 * Design decisions:
 * - CSS variables keyed on VS Code's `--vscode-*` tokens so the graph
 *   respects the active theme (dark / light / high-contrast) automatically.
 * - BEM-style class names prefixed with `ca-` to avoid collisions with
 *   React Flow's own class names.
 * - No external stylesheet files — a single injected string keeps the
 *   webview CSP simple and avoids an extra fetch.
 */
export function injectGraphStyles(): void {
  if (document.getElementById("ca-graph-styles")) return;

  const style = document.createElement("style");
  style.id = "ca-graph-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
/* =========================================================================
   Design tokens — map VS Code theme variables to Code Atlas variables
   ========================================================================= */

:root {
  --ca-bg:               var(--vscode-editor-background, #1e1e2e);
  --ca-surface:          var(--vscode-editorWidget-background, #252535);
  --ca-border:           var(--vscode-widget-border, #3a3a5c);
  --ca-text:             var(--vscode-editor-foreground, #cdd6f4);
  --ca-text-muted:       var(--vscode-descriptionForeground, #6c7086);
  --ca-accent:           var(--vscode-focusBorder, #7c3aed);
  --ca-accent-hover:     var(--vscode-button-hoverBackground, #6d28d9);
  --ca-error:            var(--vscode-errorForeground, #f38ba8);
  --ca-warning:          var(--vscode-editorWarning-foreground, #fab387);
  --ca-success:          var(--vscode-testing-iconPassed, #a6e3a1);

  /* Node colour palette */
  --ca-node-function-bg:   var(--vscode-editorWidget-background, #2a2a3e);
  --ca-node-module-bg:     #1e2a3a;
  --ca-node-genserver-bg:  #2a1e3a;
  --ca-node-focal-ring:    var(--vscode-focusBorder, #7c3aed);
  --ca-node-selected-ring: var(--vscode-list-focusHighlightForeground, #89b4fa);

  /* Edge colour palette */
  --ca-edge-call-color:       #89b4fa;
  --ca-edge-spawn-color:      #a6e3a1;
  --ca-edge-async-color:      #f9e2af;
  --ca-edge-reads-color:      #cba6f7;
  --ca-edge-writes-color:     #f38ba8;
  --ca-edge-imports-color:    #89dceb;
  --ca-edge-extends-color:    #fab387;
  --ca-edge-default-color:    #6c7086;

  /* Layout */
  --ca-radius:     6px;
  --ca-radius-sm:  3px;
  --ca-shadow:     0 2px 8px rgba(0,0,0,.35);
  --ca-toolbar-h:  40px;
  --ca-panel-w:    300px;
  --ca-font-mono:  var(--vscode-editor-font-family, "JetBrains Mono", "Menlo", monospace);
  --ca-font-ui:    var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  --ca-font-sz-sm: 11px;
  --ca-font-sz:    12px;
  --ca-font-sz-lg: 13px;
}

/* =========================================================================
   App shell
   ========================================================================= */

.ca-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--ca-bg);
  color: var(--ca-text);
  font-family: var(--ca-font-ui);
  font-size: var(--ca-font-sz);
}

/* =========================================================================
   Graph shell — fills remaining space, lays out graph + detail panel
   ========================================================================= */

.ca-app__graph-shell {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* =========================================================================
   Graph root — holds toolbar + canvas + detail-panel in a row
   ========================================================================= */

.ca-graph {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ca-graph--empty {
  align-items: center;
  justify-content: center;
  color: var(--ca-text-muted);
}

/* Main body: canvas left, panel right */
.ca-graph__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ca-graph__canvas {
  flex: 1;
  position: relative;
  min-width: 0;
}

/* React Flow overrides */
.ca-graph__canvas .react-flow__background {
  background-color: var(--ca-bg);
}

.ca-graph__canvas .react-flow__minimap {
  background: var(--ca-surface);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius);
}

.ca-graph__canvas .react-flow__controls {
  box-shadow: var(--ca-shadow);
}

.ca-graph__canvas .react-flow__controls-button {
  background: var(--ca-surface);
  border: 1px solid var(--ca-border);
  color: var(--ca-text);
  fill: var(--ca-text);
}

.ca-graph__canvas .react-flow__controls-button:hover {
  background: var(--ca-accent);
}

/* =========================================================================
   Toolbar
   ========================================================================= */

.ca-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: var(--ca-toolbar-h);
  background: var(--ca-surface);
  border-bottom: 1px solid var(--ca-border);
  flex-shrink: 0;
}

.ca-toolbar__label {
  color: var(--ca-text-muted);
  font-size: var(--ca-font-sz-sm);
  white-space: nowrap;
}

.ca-toolbar__select {
  background: var(--ca-bg);
  color: var(--ca-text);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-sm);
  padding: 2px 6px;
  font-size: var(--ca-font-sz-sm);
  cursor: pointer;
  outline: none;
}

.ca-toolbar__select:focus {
  border-color: var(--ca-accent);
}

.ca-toolbar__divider {
  width: 1px;
  height: 18px;
  background: var(--ca-border);
  margin: 0 4px;
}

.ca-toolbar__btn {
  background: var(--ca-bg);
  color: var(--ca-text);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-sm);
  padding: 2px 8px;
  font-size: var(--ca-font-sz);
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.15s;
}

.ca-toolbar__btn:hover {
  background: var(--ca-accent);
  border-color: var(--ca-accent);
}

.ca-toolbar__btn--fit {
  font-size: 15px;
  padding: 0 7px;
  line-height: 1.2;
}

/* =========================================================================
   Nodes
   ========================================================================= */

.ca-node {
  position: relative;
  min-width: 140px;
  max-width: 200px;
  background: var(--ca-node-function-bg);
  border: 1.5px solid var(--ca-border);
  border-radius: var(--ca-radius);
  padding: 6px 10px;
  box-shadow: var(--ca-shadow);
  font-family: var(--ca-font-ui);
  font-size: var(--ca-font-sz-sm);
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s;
  box-sizing: border-box;
}

.ca-node:hover {
  border-color: var(--ca-accent);
}

.ca-node--selected {
  border-color: var(--ca-node-selected-ring) !important;
  box-shadow: 0 0 0 2px var(--ca-node-selected-ring), var(--ca-shadow);
}

.ca-node--focal {
  border-color: var(--ca-node-focal-ring) !important;
  box-shadow: 0 0 0 3px var(--ca-node-focal-ring), var(--ca-shadow);
}

.ca-node--module    { background: var(--ca-node-module-bg);    }
.ca-node--genserver { background: var(--ca-node-genserver-bg); }

.ca-node__header {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}

.ca-node__kind-icon {
  font-size: 13px;
  flex-shrink: 0;
  color: var(--ca-accent);
}

.ca-node__label {
  font-weight: 600;
  color: var(--ca-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.ca-node__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ca-text-muted);
  font-size: var(--ca-font-sz-sm);
}

.ca-node__module {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.ca-node__complexity {
  flex-shrink: 0;
  margin-left: 4px;
}

.ca-node__lang-badge,
.ca-node__kind-badge {
  background: var(--ca-accent);
  color: #fff;
  border-radius: var(--ca-radius-sm);
  padding: 1px 5px;
  font-size: 10px;
  flex-shrink: 0;
}

/* Handles */
.ca-node__handle {
  width: 8px;
  height: 8px;
  background: var(--ca-border);
  border: 1.5px solid var(--ca-accent);
  border-radius: 50%;
  transition: background 0.12s;
}

.ca-node__handle:hover {
  background: var(--ca-accent);
}

/* =========================================================================
   Edges
   ========================================================================= */

.ca-edge {
  stroke-width: 1.5;
}

.ca-edge--call      { stroke: var(--ca-edge-call-color);    }
.ca-edge--spawn     { stroke: var(--ca-edge-spawn-color);   }
.ca-edge--async     { stroke: var(--ca-edge-async-color);   }
.ca-edge--reads     { stroke: var(--ca-edge-reads-color);   }
.ca-edge--writes    { stroke: var(--ca-edge-writes-color);  }
.ca-edge--imports   { stroke: var(--ca-edge-imports-color); }
.ca-edge--extends   { stroke: var(--ca-edge-extends-color); }
.ca-edge--selected  { stroke-width: 2.5; }

.ca-edge__label {
  background: var(--ca-surface);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-sm);
  padding: 1px 5px;
  font-size: 10px;
  color: var(--ca-text-muted);
  white-space: nowrap;
  cursor: default;
}

.ca-edge__label--spawn    { color: var(--ca-edge-spawn-color);  border-color: var(--ca-edge-spawn-color);  }
.ca-edge__label--async    { color: var(--ca-edge-async-color);  border-color: var(--ca-edge-async-color);  }
.ca-edge__label--reads    { color: var(--ca-edge-reads-color);  border-color: var(--ca-edge-reads-color);  }
.ca-edge__label--writes   { color: var(--ca-edge-writes-color); border-color: var(--ca-edge-writes-color); }

/* =========================================================================
   Detail panel
   ========================================================================= */

.ca-detail-panel {
  width: var(--ca-panel-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--ca-surface);
  border-left: 1px solid var(--ca-border);
  overflow: hidden;
}

.ca-detail-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ca-border);
  flex-shrink: 0;
}

.ca-detail-panel__title {
  font-size: var(--ca-font-sz);
  font-weight: 600;
  color: var(--ca-text);
}

.ca-detail-panel__close {
  background: none;
  border: none;
  color: var(--ca-text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  border-radius: var(--ca-radius-sm);
}

.ca-detail-panel__close:hover {
  color: var(--ca-text);
  background: var(--ca-border);
}

.ca-detail-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

.ca-detail-panel__symbol-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.ca-detail-panel__name {
  font-size: var(--ca-font-sz-lg);
  font-weight: 600;
  color: var(--ca-text);
  word-break: break-all;
}

.ca-detail-panel__kind-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--ca-radius-sm);
  flex-shrink: 0;
}

.ca-detail-panel__kind-badge--node {
  background: var(--ca-accent);
  color: #fff;
}

.ca-detail-panel__kind-badge--edge {
  background: #1e4620;
  color: var(--ca-success);
  border: 1px solid var(--ca-success);
}

.ca-detail-panel__section {
  margin-bottom: 14px;
}

.ca-detail-panel__section-title {
  font-size: var(--ca-font-sz-sm);
  font-weight: 600;
  color: var(--ca-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 5px;
}

.ca-detail-panel__section-content {
  color: var(--ca-text);
}

.ca-detail-panel__code {
  font-family: var(--ca-font-mono);
  font-size: var(--ca-font-sz-sm);
  background: var(--ca-bg);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-sm);
  padding: 4px 8px;
  display: block;
  word-break: break-all;
  white-space: pre-wrap;
}

.ca-detail-panel__pre {
  font-family: var(--ca-font-mono);
  font-size: var(--ca-font-sz-sm);
  background: var(--ca-bg);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-sm);
  padding: 6px 8px;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
}

.ca-detail-panel__pre code {
  font-family: inherit;
}

.ca-detail-panel__doc {
  font-size: var(--ca-font-sz-sm);
  color: var(--ca-text-muted);
  line-height: 1.5;
  margin: 0;
}

.ca-detail-panel__mono {
  font-family: var(--ca-font-mono);
  font-size: var(--ca-font-sz-sm);
}

.ca-detail-panel__metrics {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 12px;
  margin: 0;
}

.ca-detail-panel__metric-label {
  color: var(--ca-text-muted);
  font-size: var(--ca-font-sz-sm);
  white-space: nowrap;
}

.ca-detail-panel__metric-value {
  font-size: var(--ca-font-sz-sm);
  font-family: var(--ca-font-mono);
  word-break: break-all;
}

.ca-detail-panel__location-link {
  background: none;
  border: none;
  color: var(--ca-accent);
  font-family: var(--ca-font-mono);
  font-size: var(--ca-font-sz-sm);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ca-detail-panel__location-link:hover {
  color: var(--ca-accent-hover);
}

/* Edge flow */
.ca-detail-panel__edge-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ca-font-sz-sm);
  overflow: hidden;
}

.ca-detail-panel__edge-node {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.ca-detail-panel__edge-arrow {
  color: var(--ca-text-muted);
  flex-shrink: 0;
}

/* Edge list (incoming / outgoing) */
.ca-detail-panel__edge-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ca-detail-panel__edge-list-item {
  display: flex;
}

.ca-detail-panel__edge-list-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--ca-radius-sm);
  padding: 3px 6px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  color: var(--ca-text);
  font-size: var(--ca-font-sz-sm);
  transition: background 0.1s, border-color 0.1s;
}

.ca-detail-panel__edge-list-btn:hover {
  background: var(--ca-bg);
  border-color: var(--ca-border);
}

.ca-detail-panel__edge-kind {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--ca-radius-sm);
  flex-shrink: 0;
  background: var(--ca-bg);
  border: 1px solid var(--ca-border);
}

.ca-detail-panel__edge-kind--call    { border-color: var(--ca-edge-call-color);   color: var(--ca-edge-call-color);   }
.ca-detail-panel__edge-kind--spawn   { border-color: var(--ca-edge-spawn-color);  color: var(--ca-edge-spawn-color);  }
.ca-detail-panel__edge-kind--async   { border-color: var(--ca-edge-async-color);  color: var(--ca-edge-async-color);  }
.ca-detail-panel__edge-kind--reads   { border-color: var(--ca-edge-reads-color);  color: var(--ca-edge-reads-color);  }
.ca-detail-panel__edge-kind--writes  { border-color: var(--ca-edge-writes-color); color: var(--ca-edge-writes-color); }

.ca-detail-panel__edge-peer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.ca-detail-panel__blame-summary {
  font-size: var(--ca-font-sz-sm);
  color: var(--ca-text-muted);
  margin: 4px 0 0;
  font-style: italic;
}
`;
