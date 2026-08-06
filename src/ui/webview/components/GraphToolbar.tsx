import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { useAtlasStore, selectLayout } from "../store/store";
import { LayoutAlgorithm } from "../../../shared/enums";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_OPTIONS: Array<{ value: LayoutAlgorithm; label: string }> = [
  { value: LayoutAlgorithm.Dagre,      label: "Dagre"      },
  { value: LayoutAlgorithm.Horizontal, label: "Horizontal" },
  { value: LayoutAlgorithm.Vertical,   label: "Vertical"   },
  { value: LayoutAlgorithm.Tree,       label: "Tree"       },
];

// ---------------------------------------------------------------------------
// GraphToolbar
// ---------------------------------------------------------------------------

/**
 * Toolbar rendered above the React Flow canvas.
 *
 * Provides:
 * - Layout algorithm selector — triggers a re-layout via the store
 * - Zoom in / zoom out / fit-to-screen buttons
 */
export function GraphToolbar(): React.ReactElement {
  const layout     = useAtlasStore(selectLayout);
  const setLayout  = useAtlasStore((s) => s.setLayout);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleLayoutChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLayout(e.target.value as LayoutAlgorithm);
    },
    [setLayout],
  );

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ duration: 300, padding: 0.1 });
  }, [fitView]);

  return (
    <div className="ca-toolbar" role="toolbar" aria-label="Graph controls">
      {/* Layout selector */}
      <label className="ca-toolbar__label" htmlFor="ca-layout-select">
        Layout
      </label>
      <select
        id="ca-layout-select"
        className="ca-toolbar__select"
        value={layout}
        onChange={handleLayoutChange}
        aria-label="Layout algorithm"
      >
        {LAYOUT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <div className="ca-toolbar__divider" aria-hidden="true" />

      {/* Zoom controls */}
      <button
        type="button"
        className="ca-toolbar__btn"
        onClick={handleZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="ca-toolbar__btn"
        onClick={handleZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="ca-toolbar__btn ca-toolbar__btn--fit"
        onClick={handleFitView}
        title="Fit to screen"
        aria-label="Fit to screen"
      >
        ⤢
      </button>
    </div>
  );
}
