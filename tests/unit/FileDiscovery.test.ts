import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { FileDiscovery } from "../../src/extension/parsers/FileDiscovery";

// ---------------------------------------------------------------------------
// Temp workspace helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function setup(structure: Record<string, string>): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-atlas-test-"));
  for (const [relPath, content] of Object.entries(structure)) {
    const absPath = path.join(tmpDir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
  }
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const discovery = new FileDiscovery();

function rel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Basic discovery
// ---------------------------------------------------------------------------

describe("discover() — basic", () => {
  it("returns files matching the given extension", async () => {
    const root = await setup({
      "src/foo.erl": "",
      "src/bar.erl": "",
      "src/main.go": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("src/foo.erl");
    expect(rels).toContain("src/bar.erl");
    expect(rels).not.toContain("src/main.go");
  });

  it("returns all files when extensions is empty", async () => {
    const root = await setup({
      "a.erl": "",
      "b.go": "",
      "c.rs": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [],
    });

    expect(files.length).toBe(3);
  });

  it("returns sorted absolute paths", async () => {
    const root = await setup({
      "z.erl": "",
      "a.erl": "",
      "m.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
    });

    expect(files).toEqual([...files].sort());
  });

  it("returns empty array for an empty workspace", async () => {
    const root = await setup({});
    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
    });
    expect(files).toHaveLength(0);
  });

  it("recurses into subdirectories", async () => {
    const root = await setup({
      "a/b/c/deep.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
    });

    expect(files.map((f) => rel(root, f))).toContain("a/b/c/deep.erl");
  });
});

// ---------------------------------------------------------------------------
// Extension filtering
// ---------------------------------------------------------------------------

describe("discover() — extension filtering", () => {
  it("returns files matching any of the given extensions", async () => {
    const root = await setup({
      "module.erl": "",
      "header.hrl": "",
      "main.go": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl", ".hrl"],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("module.erl");
    expect(rels).toContain("header.hrl");
    expect(rels).not.toContain("main.go");
  });
});

// ---------------------------------------------------------------------------
// Exclude patterns
// ---------------------------------------------------------------------------

describe("discover() — excludePatterns", () => {
  it("excludes directories matching a simple name pattern", async () => {
    const root = await setup({
      "src/app.erl": "",
      "_build/prod/lib/app.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: ["_build"],
      extensions: [".erl"],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("src/app.erl");
    expect(rels).not.toContain("_build/prod/lib/app.erl");
  });

  it("excludes paths matching a ** glob", async () => {
    const root = await setup({
      "src/app.erl": "",
      "node_modules/dep/index.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: ["node_modules/**"],
      extensions: [".erl"],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("src/app.erl");
    expect(rels).not.toContain("node_modules/dep/index.erl");
  });

  it("excludes files matching a *.ext pattern", async () => {
    const root = await setup({
      "foo.erl": "",
      "foo.beam": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: ["*.beam"],
      extensions: [],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("foo.erl");
    expect(rels).not.toContain("foo.beam");
  });

  it("applies multiple exclude patterns", async () => {
    const root = await setup({
      "src/app.erl": "",
      "_build/app.erl": "",
      ".git/config": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: ["_build", ".git"],
      extensions: [],
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("src/app.erl");
    expect(rels).not.toContain("_build/app.erl");
    expect(rels).not.toContain(".git/config");
  });

  it("no patterns means nothing is excluded", async () => {
    const root = await setup({
      "a.erl": "",
      "_build/b.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
    });

    expect(files.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// maxDepth
// ---------------------------------------------------------------------------

describe("discover() — maxDepth", () => {
  it("maxDepth=0 returns only root-level files", async () => {
    const root = await setup({
      "root.erl": "",
      "sub/nested.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
      maxDepth: 0,
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("root.erl");
    expect(rels).not.toContain("sub/nested.erl");
  });

  it("maxDepth=1 includes one level of subdirectories", async () => {
    const root = await setup({
      "root.erl": "",
      "sub/one.erl": "",
      "sub/deep/two.erl": "",
    });

    const files = await discovery.discover(root, {
      excludePatterns: [],
      extensions: [".erl"],
      maxDepth: 1,
    });

    const rels = files.map((f) => rel(root, f));
    expect(rels).toContain("root.erl");
    expect(rels).toContain("sub/one.erl");
    expect(rels).not.toContain("sub/deep/two.erl");
  });
});
