import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

/**
 * Webview entry point.
 *
 * Finds the #root element injected by WebviewHtml.ts and mounts the React
 * application tree into it. React 18 concurrent mode is enabled via
 * `createRoot`. StrictMode is kept on so any effect / ref misuse surfaces
 * during development.
 */
const rootElement = document.getElementById("root");

if (!rootElement) {
  // This should never happen: the HTML shell always includes <div id="root">.
  throw new Error(
    "[Code Atlas] Mount failed: #root element not found in the webview document.",
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
