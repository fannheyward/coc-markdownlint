// Tests for the per-document outline symbol cache in MarkdownlintEngine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundle } from "./helpers.mjs";

const { MarkdownlintEngine } = await bundle("engine.ts", "engine.js");

const token = {};

const mkDoc = (uri, version, text, languageId = "markdown") => ({
  uri,
  version,
  languageId,
  getText: () => text,
});

test("same document + version returns the cached object (identity hit)", () => {
  const engine = new MarkdownlintEngine();
  const doc = mkDoc("file:///a.md", 1, "# A\n## B\n");
  const s1 = engine.provideDocumentSymbols(doc, token);
  const s2 = engine.provideDocumentSymbols(doc, token);
  assert.equal(s1, s2);
});

test("version bump recomputes and reflects new text", () => {
  const engine = new MarkdownlintEngine();
  const s1 = engine.provideDocumentSymbols(mkDoc("file:///b.md", 1, "# Old\n"), token);
  const s2 = engine.provideDocumentSymbols(mkDoc("file:///b.md", 2, "# New\n"), token);
  assert.notEqual(s1, s2);
  assert.equal(s2[0].name, "New");
});

test("per-document entries: alternating documents keeps both cached", () => {
  const engine = new MarkdownlintEngine();
  const a1 = engine.provideDocumentSymbols(mkDoc("file:///alt-a.md", 1, "# A\n"), token);
  engine.provideDocumentSymbols(mkDoc("file:///alt-b.md", 1, "# B\n"), token);
  const a2 = engine.provideDocumentSymbols(mkDoc("file:///alt-a.md", 1, "# A\n"), token);
  assert.equal(a1, a2);
});

test("non-markdown documents return [] without caching", () => {
  const engine = new MarkdownlintEngine();
  const out = engine.provideDocumentSymbols(mkDoc("file:///x.js", 1, "# not md\n", "javascript"), token);
  assert.deepEqual(out, []);
  // TS-private field, visible at runtime: prove nothing was cached
  assert.equal(engine.symbolCache.has("file:///x.js"), false);
});

test("forgetDocumentSymbols forces recompute on next request", () => {
  const engine = new MarkdownlintEngine();
  const s1 = engine.provideDocumentSymbols(mkDoc("file:///forget.md", 1, "# F\n"), token);
  engine.forgetDocumentSymbols("file:///forget.md");
  const s2 = engine.provideDocumentSymbols(mkDoc("file:///forget.md", 1, "# F\n"), token);
  assert.notEqual(s1, s2);
  assert.equal(s2[0].name, "F");
});

test("LRU cap evicts least recently used document", () => {
  const engine = new MarkdownlintEngine();
  // Insert 10 documents; Map insertion order doubles as recency order
  const cached = {};
  for (let i = 1; i <= 10; i++) {
    cached[i] = engine.provideDocumentSymbols(mkDoc(`file:///lru-${i}.md`, 1, `# ${i}\n`), token);
  }
  // Touch the OLDEST entry: with recency tracking it must survive the next
  // eviction; a plain FIFO implementation would evict it instead
  const touched = engine.provideDocumentSymbols(mkDoc("file:///lru-1.md", 1, "# 1\n"), token);
  assert.equal(touched, cached[1]);
  // Exceeding the cap must evict lru-2 (least recently used now), not lru-1
  engine.provideDocumentSymbols(mkDoc("file:///lru-11.md", 1, "# 11\n"), token);
  assert.equal(
    engine.provideDocumentSymbols(mkDoc("file:///lru-1.md", 1, "# 1\n"), token),
    cached[1],
    "touched lru-1 is retained",
  );
  const evicted = engine.provideDocumentSymbols(mkDoc("file:///lru-2.md", 1, "# 2\n"), token);
  assert.notEqual(evicted, cached[2], "untouched lru-2 was evicted and recomputed");
});
