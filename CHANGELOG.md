# Changelog

All notable changes to **Code Atlas** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-08-07

### Added

#### Core architecture
- Project bootstrap with TypeScript 5.9, ESBuild, ESLint, Prettier
- Shared domain models: `GraphNode`, `GraphEdge`, `CodeGraph`
- `LanguageParser` interface and `ParserRegistry` for language-agnostic plugins

#### Graph engine (Phase 4)
- `GraphBuilder` — assembles `CodeGraph` from parser output
- `GraphIndex` — O(n) secondary index (by file, module, kind, language, edge kind) with query result caching
- `GraphQuery` — BFS neighbourhood, shortest path, all paths, cycle detection
- `GraphMerge` — incremental single-file patch and file removal
- `GraphSerializer` — JSON cache with version envelope and SHA-256 checksum

#### Parser framework (Phase 5)
- `AbstractParser` base class with shared utilities
- `TreeSitterLoader` — WASM runtime initialisation with grammar caching
- `FileDiscovery` — recursive workspace walk with glob excludes
- `NodeIdGenerator` — SHA-1 stable IDs across incremental rebuilds
- `ParseWorkerHost` — worker-thread pool with round-robin dispatch

#### Erlang language support (Phase 6)
- Full Erlang parser via tree-sitter (WhatsApp grammar v0.20, compiled to WASM)
- Extracts: modules, functions (with arity, LOC, cyclomatic complexity, doc comments)
- Detects: local calls, remote calls, `spawn`/`spawn_link`, `gen_server:call/cast`, ETS read/write

#### React webview UI (Phases 3, 7)
- React 18 + Zustand + Immer state management
- React Flow graph canvas with Dagre layout engine
- Custom node renderers: `FunctionNode`, `ModuleNode`, `GenServerNode`
- Custom edge renderer: `AtlasEdge` (bezier curves, kind-coloured, labelled)
- Zoom, pan, minimap, fit-view controls
- `GraphToolbar` — layout algorithm selector and zoom controls
- `DetailPanel` — full node details (signature, metrics, location, git blame, incoming/outgoing edges) and edge details (kind, condition, source snippet, caller/callee)
- `SearchPanel` — inline symbol search bar with live fuzzy/regex search and result dropdown
- Large-graph guard: shows informational banner when node count exceeds 500

#### Workspace indexing (Phase 8)
- `WorkspaceIndexer` — full workspace parse, cache load/save, progress reporting, cancellation
- `FileWatcher` — debounced incremental re-parse on file save/create/delete
- Progress reporting to webview (`IndexProgress`, `IndexComplete`, `IndexError`)

#### Incremental parsing (Phase 9)
- `IncrementalParseQueue` — debounced change queue, de-duplication, ordered dispatch

#### Symbol search (Phase 10)
- `SearchService` — substring and regex symbol search over the live graph index
- `codeAtlas.search` command — VS Code quick-pick with live search as you type
- `SearchPanel` webview component — inline search bar with keyboard navigation
- Typed `SearchRequest` / `SearchResults` message round-trip

#### Commands
- `Code Atlas: Show Code Atlas` — opens the graph panel
- `Code Atlas: Show Code Atlas for Symbol` — focuses graph on the symbol at cursor
- `Code Atlas: Refresh Workspace Index` — force re-index with cancellable progress notification
- `Code Atlas: Clear Cache` — removes the on-disk graph cache
- `Code Atlas: Search Symbols` — live symbol search across the indexed graph

### Fixed
- N/A (initial release)

### Changed
- N/A (initial release)

---

## [Unreleased]

- JavaScript / TypeScript parser
- Python parser
- Go parser
- Force-directed and radial layout algorithms
- Multi-root workspace support
- Export graph as SVG / PNG
