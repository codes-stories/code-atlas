import { useAtlasStore, selectErrorMessage } from "../store/store";

/**
 * Shown when `view === "error"`.
 *
 * Displays the error message received from the extension host and a Retry
 * button that resets the store and re-sends the `Ready` message, prompting
 * the extension host to re-trigger indexing.
 */
export function ErrorView(): React.ReactElement {
  const errorMessage = useAtlasStore(selectErrorMessage);
  const retry = useAtlasStore((s) => s.retry);

  return (
    <div className="ca-error" role="alert" aria-live="assertive">
      <div className="ca-error__icon" aria-hidden="true">
        &#x26A0;&#xFE0F;
      </div>

      <h2 className="ca-error__heading">Code Atlas failed to load</h2>

      {errorMessage && (
        <p className="ca-error__message">{errorMessage}</p>
      )}

      <button
        className="ca-error__retry"
        type="button"
        onClick={retry}
        aria-label="Retry loading Code Atlas"
      >
        Retry
      </button>
    </div>
  );
}
