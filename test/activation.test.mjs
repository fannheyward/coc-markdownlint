// Activation test: guards the integration point that makes the outline work
// at all — src/index.ts registering the DocumentSymbolProvider (and friends)
// with the right selector, metadata, and cache cleanup wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "./helpers.mjs";

const { activate } = await bundle("index.ts", "index.js");
const hooks = globalThis.__cocTestHooks;

// Keep activate() hermetic: parseConfig() runs rc("markdownlint"), which
// reads config files from $HOME, so point HOME at an empty temp directory
process.env.HOME = mkdtempSync(path.join(tmpdir(), "coc-markdownlint-test-home-"));

await activate({ subscriptions: [] });

const token = {};
const mkDoc = (uri, version, text) => ({
  uri,
  version,
  languageId: "markdown",
  getText: () => text,
});

test("DocumentSymbolProvider is registered for markdown file/untitled with label", () => {
  const reg = hooks.registrations.find((r) => r.type === "documentSymbol");
  assert.ok(reg, "registerDocumentSymbolProvider was called");
  const [selector, provider, metadata] = reg.args;
  assert.deepEqual(selector, [
    { language: "markdown", scheme: "file" },
    { language: "markdown", scheme: "untitled" },
  ]);
  assert.deepEqual(metadata, { label: "markdownlint" });
  assert.equal(typeof provider.provideDocumentSymbols, "function");
});

test("code action provider and fixAll command are registered", () => {
  assert.ok(
    hooks.registrations.some((r) => r.type === "codeAction"),
    "code action provider registered",
  );
  assert.ok(
    hooks.registrations.some((r) => r.type === "command" && r.args[0] === "markdownlint.fixAll"),
    "fixAll command registered",
  );
});

test("registered provider produces the heading outline", () => {
  const provider = hooks.registrations.find((r) => r.type === "documentSymbol").args[1];
  const symbols = provider.provideDocumentSymbols(mkDoc("file:///act.md", 1, "# One\n## Two\n"), token);
  assert.equal(symbols[0].name, "One");
  assert.equal(symbols[0].children[0].name, "Two");
});

test("onDidCloseTextDocument wiring clears the symbol cache", () => {
  assert.equal(typeof hooks.handlers.close, "function", "close handler registered");
  const provider = hooks.registrations.find((r) => r.type === "documentSymbol").args[1];
  const doc = mkDoc("file:///wired.md", 1, "# Wired\n");
  const first = provider.provideDocumentSymbols(doc, token);
  assert.equal(provider.provideDocumentSymbols(doc, token), first, "cached before close");
  hooks.handlers.close({ uri: doc.uri });
  assert.notEqual(provider.provideDocumentSymbols(doc, token), first, "cache cleared by close handler");
});
