import { useEffect } from "react";
import { MessageType } from "../../../shared/enums";
import type { ExtensionToWebviewMessage } from "../../../shared/messages";
import { postMessage } from "../vscodeApi";
import { useAtlasStore } from "../store/store";

/**
 * Mounts the message bridge between the VS Code extension host and the
 * React application.
 *
 * On mount:
 * 1. Attaches a `window.addEventListener("message", …)` listener.
 * 2. Posts a `Ready` message so the extension host knows the webview has
 *    loaded and can begin sending graph data.
 *
 * On each incoming message the relevant Zustand action is dispatched,
 * driving the store (and therefore the UI) reactively.
 *
 * On unmount the listener is removed and no store mutation is attempted
 * after the component tree has been torn down.
 *
 * This hook must be called exactly once, in the App root component.
 */
export function useMessageBridge(): void {
  const receiveGraph = useAtlasStore((s) => s.receiveGraph);
  const receiveNodeDetails = useAtlasStore((s) => s.receiveNodeDetails);
  const receiveEdgeDetails = useAtlasStore((s) => s.receiveEdgeDetails);
  const receiveProgress = useAtlasStore((s) => s.receiveProgress);
  const receiveIndexComplete = useAtlasStore((s) => s.receiveIndexComplete);
  const receiveError = useAtlasStore((s) => s.receiveError);
  const receiveSearchResults = useAtlasStore((s) => s.receiveSearchResults);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const msg = event.data as ExtensionToWebviewMessage;

      if (typeof msg !== "object" || msg === null || typeof msg.type !== "string") {
        return;
      }

      switch (msg.type) {
        case MessageType.GraphData:
          receiveGraph(msg.graph, msg.focalNodeId);
          break;

        case MessageType.NodeDetails:
          receiveNodeDetails(msg.node, msg.incomingEdges, msg.outgoingEdges);
          break;

        case MessageType.EdgeDetails:
          receiveEdgeDetails(msg.edge, msg.sourceNode, msg.targetNode);
          break;

        case MessageType.IndexProgress:
          receiveProgress(msg.parsed, msg.total, msg.currentFile);
          break;

        case MessageType.IndexComplete:
          receiveIndexComplete(
            msg.nodeCount,
            msg.edgeCount,
            msg.durationMs,
            msg.diagnostics,
          );
          break;

        case MessageType.IndexError:
          receiveError(msg.error);
          break;

        case MessageType.SearchResults:
          receiveSearchResults(msg.results, msg.query);
          break;

        default:
          // Unknown message type — ignore silently.
          break;
      }
    }

    window.addEventListener("message", handleMessage);

    // Signal the extension host that React has mounted successfully.
    postMessage({ type: MessageType.Ready });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    receiveGraph,
    receiveNodeDetails,
    receiveEdgeDetails,
    receiveProgress,
    receiveIndexComplete,
    receiveError,
    receiveSearchResults,
  ]);
}
