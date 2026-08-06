import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { injectGraphStyles } from "./graphStyles";

/**
 * Webview entry point.
 *
 * Finds the #root element injected by WebviewHtml.ts and mounts the React
 * application tree into it. React 18 concurrent mode is enabled via
 * `createRoot`. StrictMode is kept on so any effect / ref misuse surfaces
 * during development.
 *
 * Graph component styles are injected as a single <style> block before
 * React renders so the first paint is not unstyled.
 */

// Inject all Code Atlas graph styles into the document head
injectGraphStyles();

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
