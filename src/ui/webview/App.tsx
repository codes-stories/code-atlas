import { useMessageBridge } from "./hooks/useMessageBridge";
import { useAtlasStore, selectView, selectSelectedItem } from "./store/store";
import { LoadingView }  from "./components/LoadingView";
import { ErrorView }    from "./components/ErrorView";
import { GraphView }    from "./components/GraphView";
import { DetailPanel }  from "./components/DetailPanel";

/**
 * Root application component.
 *
 * Responsibilities:
 * 1. Mount the message bridge (exactly once) so incoming extension messages
 *    drive the Zustand store.
 * 2. Read the current `view` state and render the correct child.
 * 3. Overlay the DetailPanel when the user has selected a node or edge.
 *
 * View routing:
 *   "loading"  → LoadingView (initial state, waiting for extension)
 *   "indexing" → LoadingView (workspace parse in progress, shows progress)
 *   "error"    → ErrorView   (indexing or parse failed)
 *   "graph"    → GraphView + optional DetailPanel
 */
export function App(): React.ReactElement {
  useMessageBridge();

  const view         = useAtlasStore(selectView);
  const selectedItem = useAtlasStore(selectSelectedItem);
  const isGraphView  = view === "graph";

  return (
    <div className="ca-app">
      {(view === "loading" || view === "indexing") && <LoadingView />}
      {view === "error"   && <ErrorView />}
      {isGraphView && (
        <div className="ca-app__graph-shell">
          <GraphView />
          {selectedItem !== null && <DetailPanel />}
        </div>
      )}
    </div>
  );
}
