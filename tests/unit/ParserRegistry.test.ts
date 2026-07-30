import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ParserRegistry,
  ParserNotFoundError,
  DuplicateParserError,
} from "../../src/shared/ParserRegistry";
import type { LanguageParser } from "../../src/shared/LanguageParser";
import type { CodeGraph, ParseDiagnostic } from "../../src/shared/models";

// ---------------------------------------------------------------------------
// Test double factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LanguageParser stub.
 * @param lang   canonical language identifier
 * @param exts   file extensions this parser claims to support (e.g. [".erl"])
 */
function makeParser(lang: string, exts: string[]): LanguageParser {
  return {
    language: () => lang,
    supports: (filePath: string) => exts.some((ext) => filePath.endsWith(ext)),
    parseWorkspace: vi.fn().mockResolvedValue({} as CodeGraph),
    parseFile: vi.fn().mockResolvedValue({} as CodeGraph),
    getDefinitions: vi.fn().mockResolvedValue([]),
    getReferences: vi.fn().mockResolvedValue([]),
    getRelationships: vi.fn().mockResolvedValue({ nodeId: "", outgoing: [], incoming: [] }),
    getDiagnostics: vi.fn().mockResolvedValue([] as ParseDiagnostic[]),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let registry: ParserRegistry;
let erlangParser: LanguageParser;
let goParser: LanguageParser;
let rustParser: LanguageParser;

beforeEach(() => {
  registry = new ParserRegistry();
  erlangParser = makeParser("erlang", [".erl", ".hrl"]);
  goParser = makeParser("go", [".go"]);
  rustParser = makeParser("rust", [".rs"]);
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------

describe("register()", () => {
  it("adds a parser so size increases", () => {
    expect(registry.size).toBe(0);
    registry.register(erlangParser);
    expect(registry.size).toBe(1);
  });

  it("registers multiple parsers independently", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.register(rustParser);
    expect(registry.size).toBe(3);
  });

  it("throws DuplicateParserError when the same language is registered twice", () => {
    registry.register(erlangParser);
    expect(() => registry.register(erlangParser)).toThrow(DuplicateParserError);
  });

  it("DuplicateParserError carries the duplicate language name", () => {
    registry.register(erlangParser);
    try {
      registry.register(erlangParser);
      expect.fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateParserError);
      expect((err as DuplicateParserError).language).toBe("erlang");
    }
  });

  it("throws when two different objects report the same language()", () => {
    const also_erlang = makeParser("erlang", [".beam"]);
    registry.register(erlangParser);
    expect(() => registry.register(also_erlang)).toThrow(DuplicateParserError);
  });
});

// ---------------------------------------------------------------------------
// unregister()
// ---------------------------------------------------------------------------

describe("unregister()", () => {
  it("removes a previously registered parser", () => {
    registry.register(erlangParser);
    registry.unregister("erlang");
    expect(registry.size).toBe(0);
  });

  it("is a no-op when the language was never registered", () => {
    expect(() => registry.unregister("erlang")).not.toThrow();
    expect(registry.size).toBe(0);
  });

  it("only removes the targeted language, leaving others intact", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.unregister("erlang");
    expect(registry.size).toBe(1);
    expect(registry.resolveByLanguage("go")).toBe(goParser);
    expect(registry.resolveByLanguage("erlang")).toBeUndefined();
  });

  it("allows re-registration after unregister", () => {
    registry.register(erlangParser);
    registry.unregister("erlang");
    expect(() => registry.register(erlangParser)).not.toThrow();
    expect(registry.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolve()
// ---------------------------------------------------------------------------

describe("resolve()", () => {
  beforeEach(() => {
    registry.register(erlangParser);
    registry.register(goParser);
  });

  it("returns the correct parser for a known extension", () => {
    expect(registry.resolve("/src/server.erl")).toBe(erlangParser);
    expect(registry.resolve("/cmd/main.go")).toBe(goParser);
  });

  it("returns the correct parser for a header file extension", () => {
    expect(registry.resolve("/include/types.hrl")).toBe(erlangParser);
  });

  it("returns undefined for an unrecognised extension", () => {
    expect(registry.resolve("/src/app.py")).toBeUndefined();
  });

  it("returns undefined when no parsers are registered", () => {
    const empty = new ParserRegistry();
    expect(empty.resolve("/src/main.erl")).toBeUndefined();
  });

  it("returns the first matching parser when two parsers support the same extension", () => {
    // A second parser that also claims .erl
    const secondary = makeParser("erlang-alt", [".erl"]);
    const fresh = new ParserRegistry();
    fresh.register(erlangParser);
    fresh.register(secondary);
    // Registration order determines priority.
    expect(fresh.resolve("/src/app.erl")).toBe(erlangParser);
  });

  it("handles full absolute paths, not just filenames", () => {
    expect(registry.resolve("/very/deeply/nested/path/module.erl")).toBe(erlangParser);
  });
});

// ---------------------------------------------------------------------------
// resolveByLanguage()
// ---------------------------------------------------------------------------

describe("resolveByLanguage()", () => {
  it("returns the parser for a registered language", () => {
    registry.register(erlangParser);
    expect(registry.resolveByLanguage("erlang")).toBe(erlangParser);
  });

  it("returns undefined for an unknown language", () => {
    expect(registry.resolveByLanguage("python")).toBeUndefined();
  });

  it("returns undefined after unregister", () => {
    registry.register(erlangParser);
    registry.unregister("erlang");
    expect(registry.resolveByLanguage("erlang")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveOrThrow()
// ---------------------------------------------------------------------------

describe("resolveOrThrow()", () => {
  it("returns the parser when found", () => {
    registry.register(erlangParser);
    expect(registry.resolveOrThrow("/src/app.erl")).toBe(erlangParser);
  });

  it("throws ParserNotFoundError when no parser supports the file", () => {
    expect(() => registry.resolveOrThrow("/src/app.py")).toThrow(ParserNotFoundError);
  });

  it("ParserNotFoundError carries the file path", () => {
    const path = "/src/script.py";
    try {
      registry.resolveOrThrow(path);
      expect.fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ParserNotFoundError);
      expect((err as ParserNotFoundError).filePath).toBe(path);
    }
  });

  it("error message includes the file path", () => {
    try {
      registry.resolveOrThrow("/missing.py");
      expect.fail("expected to throw");
    } catch (err) {
      expect((err as Error).message).toContain("/missing.py");
    }
  });
});

// ---------------------------------------------------------------------------
// languages()
// ---------------------------------------------------------------------------

describe("languages()", () => {
  it("returns empty array when nothing is registered", () => {
    expect(registry.languages()).toEqual([]);
  });

  it("returns all registered language identifiers", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    const langs = [...registry.languages()];
    expect(langs).toHaveLength(2);
    expect(langs).toContain("erlang");
    expect(langs).toContain("go");
  });

  it("reflects removals via unregister", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.unregister("erlang");
    expect([...registry.languages()]).toEqual(["go"]);
  });

  it("returns a snapshot — mutations to the result do not affect the registry", () => {
    registry.register(erlangParser);
    const langs = registry.languages() as string[];
    // Attempt mutation; registry should be unaffected.
    langs.push("injected");
    expect(registry.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// all()
// ---------------------------------------------------------------------------

describe("all()", () => {
  it("returns empty array when nothing is registered", () => {
    expect(registry.all()).toHaveLength(0);
  });

  it("returns all registered parsers", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    expect(registry.all()).toHaveLength(2);
  });

  it("preserves registration order", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.register(rustParser);
    const all = registry.all();
    expect(all[0]).toBe(erlangParser);
    expect(all[1]).toBe(goParser);
    expect(all[2]).toBe(rustParser);
  });

  it("reflects removals", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.unregister("erlang");
    const all = registry.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(goParser);
  });

  it("returns a snapshot — mutations do not affect the registry", () => {
    registry.register(erlangParser);
    const all = registry.all() as LanguageParser[];
    all.push(goParser);
    expect(registry.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe("size", () => {
  it("is 0 on construction", () => {
    expect(new ParserRegistry().size).toBe(0);
  });

  it("increments on register", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    expect(registry.size).toBe(2);
  });

  it("decrements on unregister", () => {
    registry.register(erlangParser);
    registry.register(goParser);
    registry.unregister("go");
    expect(registry.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error identity
// ---------------------------------------------------------------------------

describe("error types", () => {
  it("ParserNotFoundError has the correct name property", () => {
    const err = new ParserNotFoundError("/file.py");
    expect(err.name).toBe("ParserNotFoundError");
    expect(err).toBeInstanceOf(Error);
  });

  it("DuplicateParserError has the correct name property", () => {
    const err = new DuplicateParserError("erlang");
    expect(err.name).toBe("DuplicateParserError");
    expect(err).toBeInstanceOf(Error);
  });
});
