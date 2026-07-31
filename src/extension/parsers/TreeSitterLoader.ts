import * as path from "path";
import { Parser, Language } from "web-tree-sitter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Identifies where the WASM grammar file for a language lives on disk.
 */
export interface LanguageGrammarSpec {
  /** Canonical language identifier — must match the parser's `language()` return value. */
  readonly language: string;
  /** Absolute path to the `.wasm` grammar file. */
  readonly wasmPath: string;
}

// ---------------------------------------------------------------------------
// TreeSitterLoader
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of the web-tree-sitter WASM runtime and per-language
 * grammar instances.
 *
 * ## Lifecycle
 *
 * 1. Construct once per extension activation.
 * 2. Call `init()` before any grammar is requested. This boots the WASM
 *    module exactly once regardless of how many languages will be loaded.
 * 3. Call `loadLanguage(spec)` for each language grammar needed.
 * 4. Call `createParser(language)` to obtain a ready-to-use `Parser`
 *    instance with the grammar already set.
 *
 * ## Thread safety
 *
 * `init()` is idempotent — calling it multiple times is safe; subsequent
 * calls are no-ops. Grammar loads are also cached: calling `loadLanguage`
 * twice for the same language returns the cached instance without re-reading
 * the WASM file.
 */
export class TreeSitterLoader {
  private initialised = false;
  private initPromise: Promise<void> | null = null;
  private readonly grammars = new Map<string, Language>();

  /**
   * Boots the web-tree-sitter WASM runtime.
   *
   * Must be awaited before calling `loadLanguage` or `createParser`.
   * Safe to call multiple times — subsequent calls return the same promise.
   *
   * @param wasmDir  Directory that contains `web-tree-sitter.wasm`.
   *                 Defaults to the directory of the web-tree-sitter package.
   */
  async init(wasmDir?: string): Promise<void> {
    if (this.initialised) return;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.initPromise) return this.initPromise!;

    this.initPromise = Parser.init({
      locateFile: (fileName: string) => {
        const dir = wasmDir ?? defaultWasmDir();
        return path.join(dir, fileName);
      },
    }).then(() => {
      this.initialised = true;
    });

    return this.initPromise;
  }

  /**
   * Loads a language grammar from a WASM file and caches it.
   *
   * `init()` must have been called before this method.
   *
   * @throws if `init()` has not completed.
   * @throws if the WASM file cannot be read or is incompatible.
   */
  async loadLanguage(spec: LanguageGrammarSpec): Promise<Language> {
    this.assertInitialised();

    const cached = this.grammars.get(spec.language);
    if (cached) return cached;

    const lang = await Language.load(spec.wasmPath);
    this.grammars.set(spec.language, lang);
    return lang;
  }

  /**
   * Returns a fully configured `Parser` instance for the given language.
   *
   * The grammar must have been loaded via `loadLanguage` first.
   *
   * @throws if the grammar has not been loaded.
   */
  createParser(language: string): Parser {
    this.assertInitialised();

    const lang = this.grammars.get(language);
    if (!lang) {
      throw new Error(
        `TreeSitterLoader: grammar for "${language}" has not been loaded. ` +
          `Call loadLanguage() first.`,
      );
    }

    const parser = new Parser();
    parser.setLanguage(lang);
    return parser;
  }

  /**
   * Returns the cached `Language` object for a language, or undefined if it
   * has not been loaded yet.
   */
  getLanguage(language: string): Language | undefined {
    return this.grammars.get(language);
  }

  /**
   * Returns true when the WASM runtime has been successfully initialised.
   */
  get isInitialised(): boolean {
    return this.initialised;
  }

  /**
   * Returns the list of language identifiers whose grammars have been loaded.
   */
  loadedLanguages(): ReadonlyArray<string> {
    return [...this.grammars.keys()];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private assertInitialised(): void {
    if (!this.initialised) {
      throw new Error(
        "TreeSitterLoader: call init() and await it before using the loader.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the directory that contains the `web-tree-sitter.wasm` file
 * shipped with the web-tree-sitter npm package.
 */
function defaultWasmDir(): string {
  // Resolve relative to this compiled file's location.
  // In the extension bundle, this becomes dist/extension/, so we walk up
  // to the extension root and into node_modules.
  try {
    return path.dirname(require.resolve("web-tree-sitter"));
  } catch {
    // Fallback: same directory as this file.
    return __dirname;
  }
}
