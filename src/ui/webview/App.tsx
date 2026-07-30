import { useMessageBridge } from "./hooks/useMessageBridge";
import { useAtlasStore, selectView } from "./store/store";
import { LoadingView } from "./components/LoadingView";
import { ErrorView } from "./components/ErrorView";
import { GraphView } from "./components/GraphView";

/**
 * Root application component.
 *
 * Responsibilities:
 * 1. Mount the message bridge (exactly once) so incoming extension messages
 *    drive the Zustand store.
 * 2. Read the current `view` state and render the correct child.
 *
 * View routing:
 *   "loading"  → LoadingView (initial state, waiting for extension)
 *   "indexing" → LoadingView (workspace parse in progress, shows progress)
 *   "error"    → ErrorView   (indexing or parse failed)
 *   "graph"    → GraphView   (graph data received, ready to render)
 */
export function App(): React.ReactElement {
  useMessageBridge();

  const view = useAtlasStore(selectView);

  return (
    <div className="ca-app">
      {(view === "loading" || view === "indexing") && <LoadingView />}
      {view === "error" && <ErrorView />}
      {view === "graph" && <GraphView />}
    </div>
  );
}
