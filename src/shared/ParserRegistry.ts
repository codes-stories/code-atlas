import type { LanguageParser } from "./LanguageParser";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ParserNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`No parser registered for file: ${filePath}`);
    this.name = "ParserNotFoundError";
  }
}

export class DuplicateParserError extends Error {
  constructor(public readonly language: string) {
    super(`A parser for language "${language}" is already registered`);
    this.name = "DuplicateParserError";
  }
}

// ---------------------------------------------------------------------------
// ParserRegistry
// ---------------------------------------------------------------------------

/**
 * Central registry for all language parser plugins.
 *
 * Responsibilities:
 * - Accept parser registrations at startup (one per language).
 * - Resolve the correct parser for a given file path via `supports()`.
 * - Expose the full list of registered parsers for workspace-wide scans.
 *
 * The graph engine depends only on this registry; it never imports a
 * concrete parser class directly, satisfying the language-independence rule.
 */
export class ParserRegistry {
  /**
   * Ordered list of registered parsers.
   * Order matters: the first parser whose `supports()` returns true wins.
   */
  private readonly parsers: LanguageParser[] = [];

  /** Fast lookup by language identifier. */
  private readonly byLanguage = new Map<string, LanguageParser>();

  /**
   * Registers a parser plugin.
   *
   * @throws {DuplicateParserError} when a parser for the same language is already registered.
   */
  register(parser: LanguageParser): void {
    const lang = parser.language();
    if (this.byLanguage.has(lang)) {
      throw new DuplicateParserError(lang);
    }
    this.byLanguage.set(lang, parser);
    this.parsers.push(parser);
  }

  /**
   * Removes a previously registered parser.
   * Safe to call even if the parser was never registered.
   */
  unregister(language: string): void {
    const parser = this.byLanguage.get(language);
    if (!parser) return;
    this.byLanguage.delete(language);
    const idx = this.parsers.indexOf(parser);
    if (idx !== -1) {
      this.parsers.splice(idx, 1);
    }
  }

  /**
   * Returns the parser that declared support for the given file, or
   * undefined when no registered parser handles the file.
   */
  resolve(filePath: string): LanguageParser | undefined {
    return this.parsers.find((p) => p.supports(filePath));
  }

  /**
   * Returns the parser registered for a specific language identifier.
   */
  resolveByLanguage(language: string): LanguageParser | undefined {
    return this.byLanguage.get(language);
  }

  /**
   * Returns the parser for the given file, throwing if none is found.
   *
   * @throws {ParserNotFoundError}
   */
  resolveOrThrow(filePath: string): LanguageParser {
    const parser = this.resolve(filePath);
    if (!parser) {
      throw new ParserNotFoundError(filePath);
    }
    return parser;
  }

  /**
   * Returns all registered language identifiers.
   */
  languages(): ReadonlyArray<string> {
    return [...this.byLanguage.keys()];
  }

  /**
   * Returns a read-only view of all registered parsers.
   * Used by the workspace indexer to fan out parsing across all languages.
   */
  all(): ReadonlyArray<LanguageParser> {
    return [...this.parsers];
  }

  /**
   * Returns the number of registered parsers.
   */
  get size(): number {
    return this.parsers.length;
  }
}
