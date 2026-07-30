import { useAtlasStore, selectView, selectProgress } from "../store/store";

/**
 * Shown while the extension host is starting up (`view === "loading"`) or
 * actively indexing the workspace (`view === "indexing"`).
 *
 * Renders:
 * - An animated spinner
 * - A progress bar (only during indexing, when `progress.total > 0`)
 * - The current file being parsed (truncated to keep the UI tidy)
 */
export function LoadingView(): React.ReactElement {
  const view = useAtlasStore(selectView);
  const progress = useAtlasStore(selectProgress);

  const isIndexing = view === "indexing" && progress !== null;
  const percent =
    isIndexing && progress.total > 0
      ? Math.round((progress.parsed / progress.total) * 100)
      : null;

  const label = isIndexing
    ? `Indexing workspace… ${percent !== null ? `${percent}%` : ""}`
    : "Loading Code Atlas…";

  const currentFile = isIndexing ? truncatePath(progress.currentFile, 60) : null;

  return (
    <div className="ca-loading" role="status" aria-live="polite" aria-label={label}>
      <div className="ca-loading__spinner" aria-hidden="true" />

      <span className="ca-loading__label">{label}</span>

      {percent !== null && (
        <div
          className="ca-loading__progress-track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percent}% complete`}
        >
          <div
            className="ca-loading__progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {currentFile && (
        <span className="ca-loading__file" title={progress?.currentFile}>
          {currentFile}
        </span>
      )}
    </div>
  );
}

function truncatePath(filePath: string, maxLen: number): string {
  if (filePath.length <= maxLen) return filePath;
  const half = Math.floor(maxLen / 2) - 1;
  return `${filePath.slice(0, half)}…${filePath.slice(-half)}`;
}
