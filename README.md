# Code Atlas

**Visualize, understand and navigate code like a dependency graph.**

A VS Code extension that generates interactive graphs showing how code is connected across large codebases. Language-agnostic design with parser plugins.

---

## Architecture

### Directory Structure

```
code-atlas/
├── src/
│   ├── extension/         Extension host process (Node.js)
│   │   ├── commands/
│   │   ├── parsers/
│   │   ├── graph/
│   │   ├── models/
│   │   ├── services/
│   │   ├── workers/
│   │   └── main.ts
│   ├── ui/                Webview UI (React + React Flow)
│   │   └── webview/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── store/
│   │       └── index.tsx
│   └── shared/            Shared domain models and interfaces
│       ├── enums.ts
│       ├── models.ts
│       ├── LanguageParser.ts
│       ├── ParserRegistry.ts
│       ├── messages.ts
│       └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── performance/
│   ├── snapshots/
│   └── stress/
├── fixtures/
│   ├── sample-workspace/
│   └── test-workspace/
└── scripts/
    └── build.mjs          ESBuild configuration
```

### Build System

- **TypeScript** 5.9.3 with strict mode
- **ESBuild** 0.28.1 for fast bundling
  - Extension: CommonJS for Node.js
  - Webview: IIFE for browser
- **Three tsconfig files**:
  - `tsconfig.json` — root configuration with path aliases
  - `tsconfig.extension.json` — Node/CommonJS
  - `tsconfig.webview.json` — DOM/ESM/React

### Core Domain Model

#### GraphNode

Every symbol (function, class, module, etc.) is represented as a node with:

- Unique ID (stable across incremental rebuilds)
- Display name, language, kind
- Module/namespace qualifier
- Full signature
- Source location and range
- Documentation
- Complexity metrics (cyclomatic, cognitive, LOC)
- Git blame
- Incoming/outgoing edge IDs

#### GraphEdge

Every relationship is a directed edge with:

- Source and target node IDs
- Edge kind (canonical: call, spawn, async, etc.)
- Relationship type (fine-grained: goroutine, lambda, RPC, etc.)
- Call-site location
- Source code snippet
- Condition kind (if, case, match, guard, etc.)
- Condition expression

#### CodeGraph

Immutable snapshot of workspace analysis:

- All nodes keyed by ID
- All edges keyed by ID
- Metadata: languages, file count, parse duration

### Language Parser Interface

Every parser implements `LanguageParser`:

```typescript
language(): string
supports(filePath: string): boolean
parseWorkspace(input): Promise<CodeGraph>
parseFile(input): Promise<CodeGraph>
getDefinitions(filePath, symbolName): Promise<DefinitionResult[]>
getReferences(nodeId, graph): Promise<ReferenceResult[]>
getRelationships(nodeId, graph): Promise<RelationshipResult>
getDiagnostics(filePath): Promise<ParseDiagnostic[]>
```

### ParserRegistry

Central registry for all parser plugins:

- `register(parser)` — register a new language parser
- `resolve(filePath)` — find the parser that supports this file
- `resolveByLanguage(language)` — direct language lookup
- `all()` — return all registered parsers

The graph engine never imports concrete parsers — only the `LanguageParser` interface.

### Message Protocol

Strongly-typed messages between extension host and webview:

**Extension → Webview:**

- `GraphData` — full graph snapshot
- `NodeDetails` — node + incoming/outgoing edges
- `EdgeDetails` — edge + source/target nodes
- `IndexProgress` — parsing status
- `IndexComplete` — indexing finished
- `IndexError` — indexing failed

**Webview → Extension:**

- `RequestSymbol` — user selected a symbol
- `RequestNodeDetails` — user clicked a node
- `RequestEdgeDetails` — user clicked an edge
- `OpenInEditor` — jump to source location
- `Ready` — webview mounted

### Code Quality

- **ESLint** 9.39.5 with `@typescript-eslint` strict-type-checked
- **Prettier** 3.9.6
- **No placeholders**, **No TODOs** in production code
- SOLID principles
- Dependency injection
- Interfaces first

---

## Development

### Prerequisites

- Node.js ≥20.0.0
- VS Code ≥1.90.0

### Setup

```bash
npm install
npm run build
```

### Scripts

| Script             | Description                                 |
| ------------------ | ------------------------------------------- |
| `npm run build`    | Build extension + webview                   |
| `npm run watch`    | Watch mode (rebuilds on change)             |
| `npm run lint`     | ESLint check                                |
| `npm run format`   | Format with Prettier                        |
| `npm test`         | Run unit tests                              |
| `npm run typecheck`| TypeScript type-check without emit          |

### Debugging

1. Open this project in VS Code
2. Press **F5** to launch Extension Development Host
3. Use the **Run Extension** configuration in `.vscode/launch.json`

### VS Code Tasks

| Task              | Shortcut       | Description                 |
| ----------------- | -------------- | --------------------------- |
| Build             | `Cmd+Shift+B`  | Full build                  |
| Watch             | —              | Background watch mode       |
| Test              | —              | Run all tests               |

---

## Phase Status

**Phase 1: Architecture and Project Bootstrap** ✅ **COMPLETE**

- [x] Directory structure
- [x] package.json with VS Code manifest
- [x] TypeScript configuration (root, extension, webview)
- [x] ESBuild configuration
- [x] ESLint and Prettier
- [x] Core domain models (Node, Edge, Graph)
- [x] LanguageParser interface
- [x] ParserRegistry service
- [x] Shared types and enums
- [x] .vscodeignore and .gitignore
- [x] launch.json and tasks.json
- [x] Dependencies installed and verified

**Phase 2: VS Code Extension Shell** ✅ **COMPLETE**

- [x] Logger service (OutputChannel, log levels, structured output)
- [x] ConfigService (typed settings, onDidChange event)
- [x] MessageBus (typed extension↔webview bridge)
- [x] GraphWebviewProvider (singleton panel, lifecycle, message routing)
- [x] Webview HTML shell (CSP-compliant, loading spinner, nonce)
- [x] ShowGraphCommand
- [x] ShowGraphForSymbolCommand
- [x] RefreshIndexCommand
- [x] ClearCacheCommand
- [x] main.ts with full DI wiring in activate()
- [x] Unit tests: 36 passing (ParserRegistry)
- [x] ESBuild: dist/extension/main.js — clean
- [x] TypeScript: zero errors

## Phase Status

**Phase 1: Architecture and Project Bootstrap** ✅ **COMPLETE**

- [x] Directory structure
- [x] package.json with VS Code manifest
- [x] TypeScript configuration (root, extension, webview)
- [x] ESBuild configuration
- [x] ESLint and Prettier
- [x] Core domain models (Node, Edge, Graph)
- [x] LanguageParser interface
- [x] ParserRegistry service
- [x] Shared types and enums
- [x] .vscodeignore and .gitignore
- [x] launch.json and tasks.json
- [x] Dependencies installed and verified

**Phase 2: VS Code Extension Shell** ✅ **COMPLETE**

- [x] Logger service (OutputChannel, log levels, structured output)
- [x] ConfigService (typed settings, onDidChange event)
- [x] MessageBus (typed extension↔webview bridge)
- [x] GraphWebviewProvider (singleton panel, lifecycle, message routing)
- [x] Webview HTML shell (CSP-compliant, loading spinner, nonce)
- [x] ShowGraphCommand
- [x] ShowGraphForSymbolCommand
- [x] RefreshIndexCommand
- [x] ClearCacheCommand
- [x] main.ts with full DI wiring in activate()
- [x] Unit tests: 36 passing (ParserRegistry)
- [x] ESBuild: dist/extension/main.js — clean
- [x] TypeScript: zero errors

**Phase 3: React WebView** ✅ **COMPLETE**

- [x] `src/ui/webview/globals.d.ts` — `acquireVsCodeApi` global declaration
- [x] `src/ui/webview/vscodeApi.ts` — typed bridge, acquires API once, no-op stub in tests
- [x] `src/ui/webview/store/store.ts` — Zustand + Immer store (view, graph, progress, selection, error)
- [x] `src/ui/webview/hooks/useMessageBridge.ts` — `window.message` listener → store dispatch
- [x] `src/ui/webview/components/LoadingView.tsx` — spinner, progress bar, current file
- [x] `src/ui/webview/components/ErrorView.tsx` — error message + retry
- [x] `src/ui/webview/components/GraphView.tsx` — placeholder canvas (React Flow in Phase 7)
- [x] `src/ui/webview/components/StatusBar.tsx` — node/edge counts, language badges
- [x] `src/ui/webview/App.tsx` — message bridge mount, view routing
- [x] `src/ui/webview/index.tsx` — React 18 `createRoot` entry point
- [x] Unit tests: 36 passing
- [x] ESBuild: extension 22 KB, webview 1.1 MB — clean
- [x] TypeScript: zero errors (both tsconfigs)

**Phase 4: Graph Engine** ✅ **COMPLETE**

- [x] GraphBuilder — assembles CodeGraph from parser output, wires edge arrays
- [x] GraphIndex — O(n) secondary index (by file, module, kind, language, edge kind)
- [x] GraphQuery — BFS neighbourhood, shortest path, all paths, cycle detection
- [x] GraphMerge — incremental file patch, file removal, parallel merge
- [x] GraphSerializer — JSON + version envelope + SHA-256 checksum, atomic write
- [x] GraphService — single facade: builder/index/query/merge/serializer + cache I/O
- [x] Unit tests: 126 passing (GraphBuilder 23, GraphIndex 23, GraphQuery 25, GraphMerge 19, ParserRegistry 36)
- [x] ESBuild: clean
- [x] TypeScript: zero errors

**Phase 5: Parser Framework** ✅ **COMPLETE**

- [x] AbstractParser base class (shared utilities, default parseWorkspace/getReferences/getRelationships)
- [x] TreeSitterLoader (Parser.init, Language.load with caching, createParser)
- [x] FileDiscovery service (recursive walk, glob excludes, extension filter, maxDepth)
- [x] NodeIdGenerator (SHA-1 stable IDs for nodes and edges)
- [x] ParseWorkerHost (worker_thread pool, round-robin dispatch, timeout, setupWorkerHandler)
- [x] Unit tests: 158 passing (NodeIdGenerator 19, FileDiscovery 13 + previous 126)
- [x] ESBuild: clean
- [x] TypeScript: zero errors

**Phase 6: Erlang Parser** ✅ **COMPLETE**

- [x] Tree-sitter Erlang grammar (WhatsApp/tree-sitter-erlang v0.20) compiled to WASM
- [x] `grammars/tree-sitter-erlang.wasm` — 429 KB, bundled with extension
- [x] ErlangSyntaxHelper — AST traversal utilities (descendants, callTarget, isSpawnCall, etc.)
- [x] ErlangParser — extends AbstractParser, extracts:
  - Module nodes (`-module(Name).`)
  - Function nodes with arity, LOC, cyclomatic complexity, doc comments
  - Local and remote call edges
  - Spawn / spawn_link edges
  - gen_server:call/cast edges
  - ETS read/write edges
- [x] Fixture files: kv_store.erl (gen_server), kv_sup.erl (supervisor), math_utils.erl (local calls)
- [x] ErlangParser wired into main.ts activate() via ParserRegistry
- [x] Unit tests: 184 passing (ErlangParser 26 + previous 158)
- [x] ESBuild: clean
- [x] TypeScript: zero errors

**Phase 7: Graph Rendering** ✅ **COMPLETE**

- [x] React Flow integration in GraphView
- [x] Dagre layout engine (GraphLayoutEngine — LR/TB, configurable sep/rank)
- [x] Custom node renderers: FunctionNode, ModuleNode, GenServerNode
- [x] Custom edge renderer: AtlasEdge (bezier, kind-coloured, labelled)
- [x] Zoom, pan, minimap, fit-view controls (MiniMap, Controls, Background)
- [x] GraphToolbar — layout algorithm selector + zoom-in/out/fit buttons
- [x] DetailPanel — node detail (signature, metrics, location, git blame, edges) and edge detail (kind, condition, source snippet, location)
- [x] Node/edge click handlers wired to store → extension host message round-trip
- [x] graphStyles.ts — CSS design tokens keyed on VS Code theme variables, injected before React mounts
- [x] App.tsx shell: graph + detail panel flex layout
- [x] Build clean, typecheck clean, 184/184 tests passing

**Phase 8: Workspace Indexing** ✅ **COMPLETE**

- [x] WorkspaceIndexer service — full workspace parse, cache load/save, progress reporting, cancellation token support
- [x] FileWatcher service — VS Code FileSystemWatcher wrapper, debounced incremental re-parse on save/create/delete
- [x] Progress reporting to webview (IndexProgress, IndexComplete, IndexError messages)
- [x] Cache load/save orchestration — cache hit skips parse; force=true bypasses cache
- [x] main.ts fully wired — initial index on activation, RefreshIndexCommand triggers force re-index with progress UI, FileWatcher drives incremental updates
- [x] Unit tests: 203 passing (184 + 19 new WorkspaceIndexer tests)
- [x] Build clean, typecheck clean

**Phase 9: Incremental Parsing** ⬜ PENDING

- [ ] File save trigger → re-parse changed file
- [ ] GraphMerge integration with WorkspaceIndexer
- [ ] Debounce and queue management

**Phase 10: Search** ⬜ PENDING

- [ ] Symbol search command palette
- [ ] Fuzzy / regex / wildcard search
- [ ] Sidebar search panel

**Phase 11: Node Details** ⬜ PENDING

- [ ] Detail panel React component
- [ ] Node definition, documentation, metrics
- [ ] Incoming / outgoing relationship list
- [ ] Git blame display

**Phase 12: Edge Details** ⬜ PENDING

- [ ] Edge detail panel
- [ ] Caller / callee display
- [ ] Condition and source code snippet
- [ ] Open in Editor action

**Phase 13: Performance Optimisation** ⬜ PENDING

- [ ] Web Worker for parsing off the main thread
- [ ] Virtualised node/edge rendering for large graphs
- [ ] GraphIndex query caching

**Phase 14: Local Testing** ⬜ PENDING

- [ ] Integration test suite
- [ ] Performance benchmarks
- [ ] Sample workspace with Erlang project
- [ ] End-to-end smoke test

**Phase 15: Packaging** ⬜ PENDING

- [ ] .vsix bundle
- [ ] Extension icon and gallery banner
- [ ] vsce package verification

**Phase 16: Marketplace Preparation** ⬜ PENDING

- [ ] README for marketplace
- [ ] Changelog
- [ ] Publisher account and manifest review

---

## License

Internal project — not yet licensed for public distribution.
