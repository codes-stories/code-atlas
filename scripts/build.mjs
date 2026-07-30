// @ts-check
import * as esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const targetArg = args.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "all";

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: [path.join(root, "src/extension/main.ts")],
  bundle: true,
  outfile: path.join(root, "dist/extension/main.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: false,
  metafile: true,
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  alias: {
    "@shared": path.join(root, "src/shared"),
    "@extension": path.join(root, "src/extension"),
  },
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: [path.join(root, "src/ui/webview/index.tsx")],
  bundle: true,
  outfile: path.join(root, "dist/webview/index.js"),
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: true,
  minify: false,
  metafile: true,
  loader: {
    ".svg": "dataurl",
    ".png": "dataurl",
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  alias: {
    "@shared": path.join(root, "src/shared"),
    "@ui": path.join(root, "src/ui"),
  },
};

/**
 * @param {esbuild.BuildOptions} config
 * @param {string} name
 */
async function buildOrWatch(config, name) {
  if (isWatch) {
    const ctx = await esbuild.context({
      ...config,
      plugins: [
        {
          name: "watch-logger",
          setup(build) {
            build.onEnd((result) => {
              const errors = result.errors.length;
              const warnings = result.warnings.length;
              const ts = new Date().toLocaleTimeString();
              if (errors > 0) {
                console.error(`[${ts}] [${name}] Build failed: ${errors} error(s)`);
              } else {
                console.log(`[${ts}] [${name}] Rebuilt successfully (${warnings} warning(s))`);
              }
            });
          },
        },
      ],
    });
    await ctx.watch();
    console.log(`[${name}] Watching for changes…`);
  } else {
    const result = await esbuild.build(config);
    if (result.errors.length > 0) {
      console.error(`[${name}] Build failed.`);
      process.exit(1);
    }
    console.log(`[${name}] Build complete.`);
  }
}

async function main() {
  const tasks = [];

  if (target === "all" || target === "extension") {
    tasks.push(buildOrWatch(extensionConfig, "extension"));
  }
  if (target === "all" || target === "webview") {
    tasks.push(buildOrWatch(webviewConfig, "webview"));
  }

  if (tasks.length === 0) {
    console.error(`Unknown target: ${target}. Use --target=extension|webview or omit for all.`);
    process.exit(1);
  }

  await Promise.all(tasks);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
