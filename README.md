# Code Atlas
# Code Atlas

**Visualize, understand and navigate code like a dependency graph.**

A VS Code extension that generates interactive graphs showing how code is connected across large codebases. Language-agnostic design with parser plugins.

---

## Installing from Source (No Marketplace)

Code Atlas is not yet published to the VS Code Marketplace. To use it, you install it directly from the source code using one of the two methods below.

### Method 1 — Install a packaged .vsix file (recommended for users)

This is the easiest way. You build a single installable file and load it into VS Code.

**Step 1 — Get the code**

```bash
git clone https://github.com/your-org/code-atlas.git
cd code-atlas
```

**Step 2 — Install dependencies and build**

```bash
npm install
npm run build
```

**Step 3 — Package into a .vsix file**

```bash
npm run package
# This produces: code-atlas-0.1.0.vsix
```

**Step 4 — Install the .vsix into VS Code**

Option A — from the command line:
```bash
code --install-extension code-atlas-0.1.0.vsix
```

Option B — from inside VS Code:
1. Open VS Code
2. Open the Extensions panel (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows/Linux)
3. Click the `···` menu at the top-right of the Extensions panel
4. Select **Install from VSIX...**
5. Pick the `code-atlas-0.1.0.vsix` file you just built

**Step 5 — Reload VS Code**

Press `Cmd+Shift+P` → **Developer: Reload Window**

The extension is now installed. Open any Erlang workspace and use the commands below.

---

### Method 2 — Run in Extension Development Host (for contributors / testers)

This method runs the extension directly from the source folder without packaging. Any code change + rebuild is immediately testable.

**Step 1 — Get the code and install dependencies**

```bash
git clone https://github.com/your-org/code-atlas.git
cd code-atlas
npm install
npm run build
```

**Step 2 — Open the project in VS Code**

```bash
code .
```

**Step 3 — Launch the Extension Development Host**

Press **F5** (or go to Run → Start Debugging).

A new VS Code window opens with the title **[Extension Development Host]**. This window has Code Atlas loaded and active. Open your Erlang project in this window.

**Step 4 — Rebuild after changes**

```bash
npm run build
# Then reload the Extension Development Host window:
# Cmd+Shift+P → Developer: Reload Window
```

Or use watch mode so rebuilds happen automatically on every file save:

```bash
npm run watch
```

---

## Usage Guide

### Opening the graph

There are three ways to open the Code Atlas graph panel:

**Command Palette**
Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux), type `Code Atlas`, and pick any command.

**Show the full workspace graph**
- Command Palette → `Code Atlas: Show Code Atlas`

**Focus on a specific symbol**
1. Open an Erlang file
2. Click on a function name (or select it)
3. Press `Cmd+Shift+Alt+G` (Mac) / `Ctrl+Shift+Alt+G` (Windows/Linux)  
   — or right-click → **Show Code Atlas for Symbol**

The graph panel opens beside your editor and shows that symbol as the focal node, with its call graph radiating outward.

---

### What the graph shows

Each box (node) is a symbol — a function, module, gen_server, ETS table, etc. Each arrow (edge) is a relationship — a call, spawn, gen_server message, ETS read/write, etc.

| Node colour | Meaning |
|-------------|---------|
| Blue | Regular function |
| Purple | gen_server process |
| Teal | Module |

| Arrow style | Meaning |
|-------------|---------|
| Solid | Direct function call |
| Dashed | Spawn / async |
| Orange | gen_server call/cast |
| Red | ETS read/write |

---

### Navigating the graph

| Action | How |
|--------|-----|
| Pan | Click and drag the background |
| Zoom | Scroll wheel, or use the `+` / `−` buttons (bottom-left) |
| Fit all nodes | Click the **⊡** fit button (bottom-left) |
| Select a node | Click it — the Detail Panel opens on the right |
| Select an edge | Click it — the Detail Panel shows edge info |
| Jump to source | Click the file path link in the Detail Panel |
| Close Detail Panel | Click the **×** in the panel header |

---

### Searching for a symbol

**From inside the graph panel**

A search bar is built into the top of the graph. Type to filter symbols live — click any result to focus on that node.

**From the command palette**

Press `Cmd+Shift+Alt+S` (Mac) / `Ctrl+Shift+Alt+S` (Windows/Linux)  
— or Command Palette → `Code Atlas: Search Symbols`

Type a symbol name. Results appear as you type. Press Enter or click a result to jump to it in the graph.

**Regex search**

Prefix your query with `/` to use a regular expression:

```
/^handle_   →  matches handle_call, handle_cast, handle_info ...
/start      →  matches start, start_link, start_child ...
```

---

### Detail Panel

Clicking any node or edge opens the Detail Panel on the right side of the graph.

**Node details show:**
- Kind badge (function / gen_server / module / ...)
- Full signature
- Doc comment (if present in source)
- File location — click to jump to the definition in the editor
- Complexity metrics: cyclomatic complexity, cognitive complexity, lines of code, parameter count
- Module name
- Incoming edges (who calls this?)
- Outgoing edges (what does this call?)
- Git blame: last author, date, commit hash, commit message

**Edge details show:**
- Edge kind (call / spawn / gen_server / ets / ...)
- Source node → target node flow
- Condition (if the call is inside a `case`, `if`, `receive`, etc.)
- Source code snippet at the call site
- File location — click to jump to the call site in the editor

---

### Re-indexing the workspace

Code Atlas automatically re-parses changed files when you save them. If you want a full re-index (for example after switching git branches):

- Command Palette → `Code Atlas: Refresh Workspace Index`

A progress notification appears while indexing. You can cancel it at any time.

To wipe the on-disk cache and force a clean parse:

- Command Palette → `Code Atlas: Clear Cache`  
  Then run `Code Atlas: Refresh Workspace Index`

---

### Settings

Open VS Code Settings (`Cmd+,`) and search for **Code Atlas** to see all available options:

| Setting | Default | Description |
|---------|---------|-------------|
| `codeAtlas.defaultLayout` | `dagre` | Graph layout algorithm (dagre / horizontal / vertical / tree) |
| `codeAtlas.enableIncrementalParsing` | `true` | Re-parse only changed files on save |
| `codeAtlas.maxNodes` | `100000` | Maximum nodes to load into the graph |
| `codeAtlas.maxEdges` | `500000` | Maximum edges to load into the graph |
| `codeAtlas.enableGitBlame` | `true` | Annotate nodes with git blame info |
| `codeAtlas.cacheDirectory` | _(workspace root)_ | Override the cache directory path |
| `codeAtlas.logLevel` | `info` | Log verbosity (debug / info / warn / error) |

---

### Supported languages

| Language | Status |
|----------|--------|
| Erlang | ✅ Full support |
| JavaScript / TypeScript | Planned |
| Python | Planned |
| Go | Planned |

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

**Phase 9: Incremental Parsing** ✅ **COMPLETE**

- [x] File save trigger → re-parse changed file via `FileWatcher`
- [x] `IncrementalParseQueue` — debounced change queue, de-duplication, ordered dispatch
- [x] `GraphMerge` integration with `WorkspaceIndexer`
- [x] Unit tests: 18 new (221 total)

**Phase 10: Search** ✅ **COMPLETE**

- [x] `SearchService` — substring and regex symbol search over the live `GraphIndex`
- [x] `SearchCommand` — `codeAtlas.search` command, VS Code quick-pick with live results as you type
- [x] `SearchPanel` — inline webview search bar with debounce, dropdown results, keyboard navigation
- [x] Typed `SearchRequest` / `SearchResults` message round-trip (extension ↔ webview)
- [x] Store actions: `setSearchQuery`, `receiveSearchResults`
- [x] Keybinding: `Cmd+Shift+Alt+S`

**Phase 11: Node Details** ✅ **COMPLETE** *(delivered in Phase 7)*

- [x] `DetailPanel` React component
- [x] Node definition, documentation, metrics (cyclomatic, cognitive, LOC, parameters)
- [x] Incoming / outgoing relationship list with clickable edges
- [x] Git blame display (author, date, commit, summary)
- [x] Full `NodeDetails` message round-trip

**Phase 12: Edge Details** ✅ **COMPLETE** *(delivered in Phase 7)*

- [x] Edge detail panel
- [x] Caller / callee display with source → target flow
- [x] Condition kind and expression display
- [x] Source code snippet (call site)
- [x] Open in Editor action

**Phase 13: Performance Optimisation** ✅ **COMPLETE**

- [x] `GraphIndex.searchByName()` result caching (Map-based, naturally invalidated on graph rebuild)
- [x] Large-graph rendering guard: banner + `MAX_RENDER_NODES = 500` layout cap when no focal node
- [x] `GraphLayoutEngine.layout()` accepts `maxNodes` parameter to limit layout scope

**Phase 14: Integration Tests** ✅ **COMPLETE**

- [x] `tests/integration/smoke.test.ts` — 58 tests, full `GraphService` + `GraphIndex` + `GraphQuery` pipeline with a realistic 11-node/9-edge Erlang graph (no WASM needed)
- [x] `tests/integration/graphPipeline.test.ts` — 31 tests, full serialize/deserialize round-trip with real temp files
- [x] `vitest.integration.config.ts` for `npm run test:integration`
- [x] 89 integration tests pass

**Phase 15: Packaging** ✅ **COMPLETE**

- [x] `.vscodeignore` audited — excludes src/, tests/, fixtures/, scripts/, config files; includes dist/, grammars/, assets/
- [x] Extension icon (`assets/icon.png`) — 128×128 PNG with Code Atlas graph motif
- [x] `package.json` — icon, galleryBanner, publisher, categories, keywords all set
- [x] `vsce` available as devDependency (`@vscode/vsce`)

**Phase 16: Marketplace Preparation** ✅ **COMPLETE**

- [x] `CHANGELOG.md` — full changelog following Keep a Changelog format
- [x] README marketplace section (this document)
- [x] `package.json` — publisher `code-atlas`, categories `["Visualization", "Programming Languages", "Other"]`, keywords set
- [x] All commands registered with titles, icons, keybindings, and commandPalette entries

---

## License

Internal project — not yet licensed for public distribution.
