/**
 * VS Code injects `acquireVsCodeApi` into every webview's global scope.
 * This declaration tells TypeScript it exists so we can call it without
 * casting through `unknown`.
 *
 * The full type is intentionally loose here — our typed wrapper in
 * `vscodeApi.ts` narrows it to the actual contract we use.
 */
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): T;
};
