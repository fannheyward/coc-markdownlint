// Shared test helpers: bundle a src entry with esbuild (resolving coc.nvim to
// the stub in test/stubs) and load the result with require().
import * as esbuild from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubPath = path.join(rootDir, "test", "stubs", "coc.nvim.js");

/**
 * Bundles src/<entry> into test/.build/<outfile> and returns its exports.
 * Bundling mirrors esbuild.mjs (same mainFields) so tests exercise the real
 * shipped code path instead of a hand-rolled loader.
 */
export async function bundle(entry, outfile) {
  const outPath = path.join(rootDir, "test", ".build", outfile);
  await esbuild.build({
    entryPoints: [path.join(rootDir, "src", entry)],
    bundle: true,
    format: "cjs",
    platform: "node",
    // Same as esbuild.mjs: prefer ESM builds so UMD wrappers (e.g.
    // jsonc-parser) don't leak runtime requires outside the bundle
    mainFields: ["module", "main"],
    alias: { "coc.nvim": stubPath },
    outfile: outPath,
  });
  const require = createRequire(pathToFileURL(outPath).href);
  return require(outPath);
}
