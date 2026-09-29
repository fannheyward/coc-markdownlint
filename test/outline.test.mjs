// Tests for the micromark-based markdown heading outline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundle } from "./helpers.mjs";

const { outlineSymbols } = await bundle("outline.ts", "outline.js");

// Flatten a symbol tree preserving "parent > child" paths for assertions
function names(symbols, prefix = "") {
  const out = [];
  for (const s of symbols) {
    const label = `${prefix}${s.name}`;
    out.push(label);
    out.push(...names(s.children ?? [], `${label} > `));
  }
  return out;
}

test("basic ATX hierarchy", () => {
  const doc = `# Title

## Section A

### Sub A1

## Section B

### Sub B1
`;
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), [
    "Title",
    "Title > Section A",
    "Title > Section A > Sub A1",
    "Title > Section B",
    "Title > Section B > Sub B1",
  ]);
  assert.equal(syms[0].kind, 1); // File
  assert.equal(syms[0].children[0].kind, 2); // Module
});

test("code fence skipped", () => {
  const doc = `# Real

\`\`\`js
# not a heading
## also not
\`\`\`

## After

\`\`\`
unterminated fence
# still inside
`;
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["Real", "Real > After"]);
});

test("tilde fence", () => {
  const doc = `# Real

~~~python
# python comment, not a heading
~~~~

## After
`;
  assert.deepEqual(names(outlineSymbols(doc)), ["Real", "Real > After"]);
});

test("front matter skipped", () => {
  const doc = `---
title: hello
---

# Title
`;
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["Title"]);
});

test("front matter closed by ...", () => {
  const doc = `---
title: hello
...

# Title
`;
  assert.deepEqual(names(outlineSymbols(doc)), ["Title"]);
});

test("setext headings", () => {
  const doc = `Title one
=========

Paragraph.

Title two
---
`;
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["Title one", "Title one > Title two"]);
  // Character-level ranges: text span excludes the underline, range covers it
  const second = syms[0].children[0];
  assert.deepEqual(second.selectionRange, {
    start: { line: 5, character: 0 },
    end: { line: 5, character: 9 },
  });
  assert.deepEqual(second.range, {
    start: { line: 5, character: 0 },
    end: { line: 6, character: 3 },
  });
});

test("ATX closing sequence", () => {
  const doc = "## Closed heading ##\n\n# Trailing hash# stays\n";
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["Closed heading", "Trailing hash# stays"]);
});

test("hashes without space are not headings", () => {
  assert.deepEqual(names(outlineSymbols("#5 bolt\n#hashtag\n#!\n")), []);
});

test("seven hashes is not a heading", () => {
  assert.deepEqual(names(outlineSymbols("####### seven\n")), []);
});

test("4-space indented hash is not a heading", () => {
  assert.deepEqual(names(outlineSymbols("    # indented code\n")), []);
});

test("1-3 space indented heading is a heading", () => {
  const syms = outlineSymbols("  ## Indented\n");
  assert.deepEqual(names(syms), ["Indented"]);
  assert.equal(syms[0].range.start.character, 2);
  assert.equal(syms[0].selectionRange.start.character, 5);
});

test("empty heading name falls back to markers", () => {
  assert.deepEqual(names(outlineSymbols("#\n## ##\n")), ["#", "# > ##"]);
});

test("table delimiter row is not a heading", () => {
  const doc = `# T

| Name | Age |
| --- | --- |
| a | b |
`;
  assert.deepEqual(names(outlineSymbols(doc)), ["T"]);
});

test("thematic break not heading", () => {
  assert.deepEqual(names(outlineSymbols("a\n\n---\n\n# H\n")), ["H"]);
});

test("setext not after list item", () => {
  assert.deepEqual(names(outlineSymbols("- item\n---\n")), []);
});

test("setext not after blockquote", () => {
  assert.deepEqual(names(outlineSymbols("> quote\n---\n")), []);
});

test("setext not after link reference definition", () => {
  assert.deepEqual(names(outlineSymbols("[foo]: /url\n---\n")), []);
});

test("setext not after html block", () => {
  assert.deepEqual(names(outlineSymbols("<div>\n---\n")), []);
});

test("no headings", () => {
  assert.deepEqual(outlineSymbols("just text\n\nmore text\n"), []);
  assert.deepEqual(outlineSymbols(""), []);
});

test("level jumps", () => {
  const doc = "# A\n\n### deep\n\n## mid\n\n### deep2\n";
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["A", "A > deep", "A > mid", "A > mid > deep2"]);
});

test("orphan levels", () => {
  const doc = "## one\n\n### two\n\n## three\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["one", "one > two", "three"]);
});

test("CRLF", () => {
  const doc = "# Title\r\n\r\n## Section\r\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Title", "Title > Section"]);
});

test("ranges", () => {
  const doc = "# Hello world\n";
  const s = outlineSymbols(doc)[0];
  assert.deepEqual(s.selectionRange, {
    start: { line: 0, character: 2 },
    end: { line: 0, character: 13 },
  });
  assert.deepEqual(s.range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 13 },
  });
});

test("unicode", () => {
  const doc = "# 中文标题\n";
  const s = outlineSymbols(doc)[0];
  assert.equal(s.name, "中文标题");
  assert.equal(s.selectionRange.start.character, 2);
  assert.equal(s.selectionRange.end.character, 6);
});

test("info string with backticks not a fence", () => {
  const doc = "# Title\n\n``` bad ` info\n# Heading inside paragraph-ish\n```\n\n## End\n";
  // ``` bad ` info is NOT a fence, so "# Heading..." is a real H1 (sibling of Title),
  // and the lone ``` opens a fence that swallows "## End"
  assert.deepEqual(names(outlineSymbols(doc)), ["Title", "Heading inside paragraph-ish"]);
});

test("heading after front matter", () => {
  const doc = "---\ntitle: x\n---\n# H1\n## H2\n";
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["H1", "H1 > H2"]);
});

test("setext underline with leading spaces", () => {
  assert.deepEqual(names(outlineSymbols("Title\n   ---\n")), ["Title"]);
});

test("setext not after indented code", () => {
  assert.deepEqual(names(outlineSymbols("    code\n---\n")), []);
});

test("blockquote heading", () => {
  const doc = "# Title\n\n> ## Quoted section\n> more quote\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Title", "Title > Quoted section"]);
});

test("heading inside list item", () => {
  const doc = "- ## Heading in list\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Heading in list"]);
});

test("setext heading inside blockquote", () => {
  const doc = "> Quoted title\n> -------------\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Quoted title"]);
});

test("heading in nested blockquote + list", () => {
  const doc = "> - > ### Deep heading\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Deep heading"]);
});

test("front matter with blank line inside", () => {
  const doc = "---\ntitle: x\n\ntags: y\n---\n# Heading\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Heading"]);
});

test("TOML front matter", () => {
  const doc = "+++\ntitle = 'x'\n+++\n# Heading\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Heading"]);
});

test("TOML front matter closed by ... with # comment inside is skipped", () => {
  // markdownlint's matcher accepts "..." as the TOML closer, so a "#"
  // comment line inside must not leak into the outline
  const doc = "+++\n# toml comment\nx = 1\n...\n# Real\n";
  assert.deepEqual(names(outlineSymbols(doc)), ["Real"]);
});

test("JSON front matter", () => {
  const doc = '{\n  "title": "x"\n}\n# Heading\n';
  assert.deepEqual(names(outlineSymbols(doc)), ["Heading"]);
});

test("unclosed front matter parses normally", () => {
  assert.deepEqual(names(outlineSymbols("---\n# Heading\n")), ["Heading"]);
});

test("astral plane emoji positions", () => {
  const doc = "# Title \u{1F600} done\n";
  const s = outlineSymbols(doc)[0];
  assert.equal(s.name, "Title 😀 done");
  // "# Title " is 8 UTF-16 units, emoji 2 more, " done" 5 => 15
  assert.equal(s.selectionRange.end.character, 15);
});

test("multi-line setext name", () => {
  const doc = "first line\nsecond line\n===\n";
  const syms = outlineSymbols(doc);
  assert.deepEqual(names(syms), ["first line second line"]);
  // selectionRange spans the whole multi-line text
  assert.equal(syms[0].selectionRange.start.line, 0);
  assert.equal(syms[0].selectionRange.end.line, 1);
});

test("empty heading selection range", () => {
  const doc = "##\n";
  const s = outlineSymbols(doc)[0];
  assert.equal(s.name, "##");
  assert.deepEqual(s.selectionRange, { start: { line: 0, character: 2 }, end: { line: 0, character: 2 } });
  assert.ok(s.range.start.character <= s.selectionRange.start.character);
  assert.ok(s.selectionRange.end.character <= s.range.end.character);
});
