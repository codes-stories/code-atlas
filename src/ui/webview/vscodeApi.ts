import type { WebviewToExtensionMessage } from "../../shared/messages";

/**
 * The subset of the VS Code webview API surface we need.
 * Typed to match the real `acquireVsCodeApi()` return value.
 */
interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): T;
}

/**
 * Acquire the VS Code webview API handle.
 *
 * `acquireVsCodeApi()` may only be called once per webview lifetime.
 * This module caches the result so every import shares the same instance.
 *
 * In non-webview environments (e.g. Vitest running in Node) the global is
 * absent. The fallback is a no-op stub so unit tests can import UI modules
 * without crashing.
 */
function acquireApi(): VsCodeApi {
  if (typeof acquireVsCodeApi !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return acquireVsCodeApi() as VsCodeApi;
  }

  // Stub for test environments.
  return {
    postMessage: () => undefined,
    getState: () => undefined,
    setState: <T>(s: T) => s,
  };
}

// Single shared instance — must not call acquireVsCodeApi more than once.
const api: VsCodeApi = acquireApi();

/**
 * Posts a strongly-typed message from the webview to the extension host.
 */
export function postMessage(message: WebviewToExtensionMessage): void {
  api.postMessage(message);
}

/**
 * Persists webview state across panel hides/reveals using VS Code's
 * built-in state mechanism (survives `retainContextWhenHidden`).
 */
export function getState<T>(): T | undefined {
  return api.getState<T>();
}

/**
 * Saves webview state. Returns the value that was stored.
 */
export function setState<T>(state: T): T {
  return api.setState(state);
}

// Expose the type so callers can declare the state shape.
export type { VsCodeApi };
