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

**Next Phase:**

Phase 4: Graph Engine — build the in-memory graph, node/edge indexing, neighbourhood queries.

---

## License

Internal project — not yet licensed for public distribution.
