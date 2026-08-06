import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAtlasStore,
  selectSearchQuery,
  selectSearchResults,
} from "../store/store";
import type { SearchNodeRef } from "../../../shared/messages";

// ---------------------------------------------------------------------------
// SearchPanel
// ---------------------------------------------------------------------------

/**
 * Inline symbol-search bar rendered above the graph canvas.
 *
 * Behaviour:
 * - The input is debounced (250 ms) before posting a `SearchRequest` message
 *   to the extension host via the store's `setSearchQuery` action.
 * - Results arrive as `SearchResults` messages dispatched by
 *   `useMessageBridge` → `receiveSearchResults`.
 * - A dropdown list is displayed when the query is non-empty and results
 *   are present.
 * - Clicking a result calls `requestNodeDetails(id)` so the detail panel
 *   opens for that node.
 * - Pressing Escape clears the query and hides the dropdown.
 */
export function SearchPanel(): React.ReactElement {
  const setSearchQuery = useAtlasStore((s) => s.setSearchQuery);
  const requestNodeDetails = useAtlasStore((s) => s.requestNodeDetails);
  const query = useAtlasStore(selectSearchQuery);
  const results = useAtlasStore(selectSearchResults);

  // Local input value so the input feels instant; debounce before dispatching.
  const [inputValue, setInputValue] = useState<string>(query);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync store query into input on external resets (e.g. retry()).
  useEffect(() => {
    if (query === "") {
      setInputValue("");
      setIsOpen(false);
    }
  }, [query]);

  // Open dropdown whenever new results arrive for a non-empty query.
  useEffect(() => {
    if (inputValue.trim().length > 0 && results.length > 0) {
      setIsOpen(true);
    }
  }, [results, inputValue]);

  // Close dropdown on outside click.
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }

      if (value.trim().length === 0) {
        setIsOpen(false);
        // Clear results immediately.
        setSearchQuery("");
        return;
      }

      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 250);
    },
    [setSearchQuery],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setInputValue("");
        setIsOpen(false);
        setSearchQuery("");
      }
    },
    [setSearchQuery],
  );

  const handleResultClick = useCallback(
    (result: SearchNodeRef) => {
      requestNodeDetails(result.id);
      setIsOpen(false);
    },
    [requestNodeDetails],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="ca-search" ref={containerRef} role="search" aria-label="Symbol search">
      <div className="ca-search__input-row">
        <span className="ca-search__icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          className="ca-search__input"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search symbols (prefix / for regex)…"
          aria-label="Search symbols"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="ca-search-results"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {isOpen && results.length > 0 && (
        <ul
          id="ca-search-results"
          className="ca-search__results"
          role="listbox"
          aria-label="Search results"
        >
          {results.map((result) => (
            <SearchResultItem
              key={result.id}
              result={result}
              onClick={handleResultClick}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchResultItem
// ---------------------------------------------------------------------------

interface SearchResultItemProps {
  readonly result: SearchNodeRef;
  readonly onClick: (result: SearchNodeRef) => void;
}

function SearchResultItem({ result, onClick }: SearchResultItemProps): React.ReactElement {
  const handleClick = useCallback(() => {
    onClick(result);
  }, [onClick, result]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(result);
      }
    },
    [onClick, result],
  );

  // Derive a short filename from the full file path.
  const fileName = result.file.split("/").pop() ?? result.file;

  return (
    <li
      className="ca-search__result"
      role="option"
      aria-selected={false}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="ca-search__result-name">{result.displayName}</span>
      <span className="ca-search__result-meta">
        <span className="ca-search__result-kind">{result.kind}</span>
        {result.module && (
          <span className="ca-search__result-module">{result.module}</span>
        )}
        <span className="ca-search__result-file">{fileName}</span>
      </span>
    </li>
  );
}
