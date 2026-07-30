import { useAtlasStore, selectNodeCount, selectEdgeCount, selectLanguages } from "../store/store";

/**
 * Fixed status bar rendered at the bottom of the graph canvas.
 *
 * Displays:
 * - Node count
 * - Edge count
 * - One badge per language present in the graph
 */
export function StatusBar(): React.ReactElement {
  const nodeCount = useAtlasStore(selectNodeCount);
  const edgeCount = useAtlasStore(selectEdgeCount);
  const languages = useAtlasStore(selectLanguages);

  return (
    <footer className="ca-statusbar" aria-label="Graph statistics">
      <span className="ca-statusbar__stat">
        <span className="ca-statusbar__value">{nodeCount.toLocaleString()}</span>
        {" "}
        <span className="ca-statusbar__key">nodes</span>
      </span>

      <span className="ca-statusbar__separator" aria-hidden="true">·</span>

      <span className="ca-statusbar__stat">
        <span className="ca-statusbar__value">{edgeCount.toLocaleString()}</span>
        {" "}
        <span className="ca-statusbar__key">edges</span>
      </span>

      {languages.length > 0 && (
        <>
          <span className="ca-statusbar__separator" aria-hidden="true">·</span>
          <ul className="ca-statusbar__languages" aria-label="Languages" role="list">
            {languages.map((lang) => (
              <li key={lang} className="ca-statusbar__lang-badge">
                {lang}
              </li>
            ))}
          </ul>
        </>
      )}
    </footer>
  );
}
