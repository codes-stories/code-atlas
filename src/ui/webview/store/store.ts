import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { castDraft } from "immer";
import type { CodeGraph, GraphNode, GraphEdge, ParseDiagnostic } from "../../../shared/models";
import type { LayoutAlgorithm } from "../../../shared/enums";
import type { SearchNodeRef } from "../../../shared/messages";
import { postMessage } from "../vscodeApi";
import { MessageType } from "../../../shared/enums";

// ---------------------------------------------------------------------------
// View states
// ---------------------------------------------------------------------------

export type ViewState = "loading" | "indexing" | "graph" | "error";

// ---------------------------------------------------------------------------
// Index progress
// ---------------------------------------------------------------------------

export interface IndexProgress {
  readonly parsed: number;
  readonly total: number;
  readonly currentFile: string;
}

// ---------------------------------------------------------------------------
// Selected item
// ---------------------------------------------------------------------------

export type SelectedItem =
  | { kind: "node"; node: GraphNode; incomingEdges: ReadonlyArray<GraphEdge>; outgoingEdges: ReadonlyArray<GraphEdge> }
  | { kind: "edge"; edge: GraphEdge; sourceNode: GraphNode; targetNode: GraphNode }
  | null;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface AtlasState {
  // --- View ---
  view: ViewState;

  // --- Graph data ---
  graph: CodeGraph | null;
  focalNodeId: string | null;

  // --- Selected item (detail panel) ---
  selectedItem: SelectedItem;

  // --- Indexing progress ---
  progress: IndexProgress | null;

  // --- Error ---
  errorMessage: string | null;

  // --- UI preferences ---
  layout: LayoutAlgorithm;
  diagnostics: ReadonlyArray<ParseDiagnostic>;

  // --- Search ---
  searchQuery: string;
  searchResults: ReadonlyArray<SearchNodeRef>;
}

// ---------------------------------------------------------------------------
// Store actions
// ---------------------------------------------------------------------------

export interface AtlasActions {
  // Driven by incoming extension→webview messages
  receiveGraph(graph: CodeGraph, focalNodeId: string | null): void;
  receiveNodeDetails(
    node: GraphNode,
    incomingEdges: ReadonlyArray<GraphEdge>,
    outgoingEdges: ReadonlyArray<GraphEdge>,
  ): void;
  receiveEdgeDetails(edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode): void;
  receiveProgress(parsed: number, total: number, currentFile: string): void;
  receiveIndexComplete(
    nodeCount: number,
    edgeCount: number,
    durationMs: number,
    diagnostics: ReadonlyArray<ParseDiagnostic>,
  ): void;
  receiveError(errorMessage: string): void;

  // Driven by user interaction → posts messages to extension host
  requestNodeDetails(nodeId: string): void;
  requestEdgeDetails(edgeId: string): void;
  openInEditor(filePath: string, line: number, column: number): void;
  clearSelection(): void;
  setLayout(layout: LayoutAlgorithm): void;
  retry(): void;

  // Search
  setSearchQuery(query: string): void;
  receiveSearchResults(results: ReadonlyArray<SearchNodeRef>, query: string): void;
}

export type AtlasStore = AtlasState & AtlasActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: AtlasState = {
  view: "loading",
  graph: null,
  focalNodeId: null,
  selectedItem: null,
  progress: null,
  errorMessage: null,
  layout: "dagre" as LayoutAlgorithm,
  diagnostics: [],
  searchQuery: "",
  searchResults: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAtlasStore = create<AtlasStore>()(
  immer((set) => ({
    ...INITIAL_STATE,

    // -----------------------------------------------------------------------
    // Incoming messages from the extension host
    // -----------------------------------------------------------------------

    receiveGraph(graph, focalNodeId) {
      set((s) => {
        s.view = "graph";
        s.graph = castDraft(graph);
        s.focalNodeId = focalNodeId;
        s.errorMessage = null;
        s.progress = null;
      });
    },

    receiveNodeDetails(node, incomingEdges, outgoingEdges) {
      set((s) => {
        s.selectedItem = {
          kind: "node",
          node: castDraft(node),
          incomingEdges: castDraft(incomingEdges),
          outgoingEdges: castDraft(outgoingEdges),
        };
      });
    },

    receiveEdgeDetails(edge, sourceNode, targetNode) {
      set((s) => {
        s.selectedItem = {
          kind: "edge",
          edge: castDraft(edge),
          sourceNode: castDraft(sourceNode),
          targetNode: castDraft(targetNode),
        };
      });
    },

    receiveProgress(parsed, total, currentFile) {
      set((s) => {
        s.view = "indexing";
        s.progress = { parsed, total, currentFile };
      });
    },

    receiveIndexComplete(_nodeCount, _edgeCount, _durationMs, diagnostics) {
      set((s) => {
        s.progress = null;
        s.diagnostics = castDraft(diagnostics);
      });
    },

    receiveError(errorMessage) {
      set((s) => {
        s.view = "error";
        s.errorMessage = errorMessage;
        s.progress = null;
      });
    },

    // -----------------------------------------------------------------------
    // User-initiated actions — post messages to the extension host
    // -----------------------------------------------------------------------

    requestNodeDetails(nodeId) {
      postMessage({ type: MessageType.RequestNodeDetails, nodeId });
    },

    requestEdgeDetails(edgeId) {
      postMessage({ type: MessageType.RequestEdgeDetails, edgeId });
    },

    openInEditor(filePath, line, column) {
      postMessage({ type: MessageType.OpenInEditor, filePath, line, column });
    },

    clearSelection() {
      set((s) => {
        s.selectedItem = null;
      });
    },

    setLayout(layout) {
      set((s) => {
        s.layout = layout;
      });
    },

    retry() {
      set((s) => {
        s.view = "loading";
        s.errorMessage = null;
        s.graph = null;
        s.progress = null;
      });
      // Signal the extension host that the webview is ready again so it
      // re-triggers the graph build.
      postMessage({ type: MessageType.Ready });
    },

    // -----------------------------------------------------------------------
    // Search actions
    // -----------------------------------------------------------------------

    setSearchQuery(query) {
      set((s) => {
        s.searchQuery = query;
      });
      postMessage({ type: MessageType.SearchRequest, query });
    },

    receiveSearchResults(results, query) {
      set((s) => {
        s.searchQuery = query;
        s.searchResults = castDraft(results);
      });
    },
  })),
);

// ---------------------------------------------------------------------------
// Selector helpers — stable references for common derived values
// ---------------------------------------------------------------------------

export const selectView = (s: AtlasStore): ViewState => s.view;
export const selectGraph = (s: AtlasStore): CodeGraph | null => s.graph;
export const selectFocalNodeId = (s: AtlasStore): string | null => s.focalNodeId;
export const selectSelectedItem = (s: AtlasStore): SelectedItem => s.selectedItem;
export const selectProgress = (s: AtlasStore): IndexProgress | null => s.progress;
export const selectErrorMessage = (s: AtlasStore): string | null => s.errorMessage;
export const selectLayout = (s: AtlasStore): LayoutAlgorithm => s.layout;
export const selectDiagnostics = (s: AtlasStore): ReadonlyArray<ParseDiagnostic> => s.diagnostics;

export const selectNodeCount = (s: AtlasStore): number =>
  s.graph ? Object.keys(s.graph.nodes).length : 0;

export const selectEdgeCount = (s: AtlasStore): number =>
  s.graph ? Object.keys(s.graph.edges).length : 0;

export const selectLanguages = (s: AtlasStore): ReadonlyArray<string> =>
  s.graph?.languages ?? [];

export const selectSearchQuery = (s: AtlasStore): string => s.searchQuery;
export const selectSearchResults = (s: AtlasStore): ReadonlyArray<SearchNodeRef> => s.searchResults;
