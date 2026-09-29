import { DocumentSymbol, Position, Range, SymbolKind } from "coc.nvim";
// markdownlint's own front matter matcher (YAML, TOML, JSON): importing it
// keeps the outline's front matter recognition identical to the linter's
import { frontMatterRe } from "markdownlint/helpers";
import { parse, postprocess, preprocess } from "micromark";
// Canonical micromark token type constants (literal-typed, so comparisons
// against token.type keep narrowing)
import { types } from "micromark-util-symbol";

interface ParsedHeading {
  /** Heading level, 1-6 */
  level: number;
  /** Heading text without ATX markers, closing sequences, or setext underlines */
  text: string | null;
  /** Character offset of the heading start (the "#" markers for ATX, the text otherwise) */
  rangeStart: number;
  /** Character offset of the heading text (== rangeStart for empty headings) */
  textStart: number;
  /** Character offset just past the heading text */
  textEnd: number;
}

// Replaces front matter with same-length whitespace so the parser sees empty
// lines while every character offset stays valid
function blankFrontMatter(text: string): string {
  const match = text.match(frontMatterRe);
  if (match?.index !== 0) {
    return text;
  }
  const end = match.index + match[0].length;
  return text.slice(0, end).replace(/[^\r\n]/g, " ") + text.slice(end);
}

function parseHeadings(text: string): ParsedHeading[] {
  const blanked = blankFrontMatter(text);
  const chunks = preprocess()(blanked, undefined, true);
  const events = postprocess(parse({}).document().write(chunks));

  const headings: ParsedHeading[] = [];
  let current: ParsedHeading | null = null;

  for (const [kind, token] of events) {
    const type = token.type;
    if (type === types.atxHeading || type === types.setextHeading) {
      if (kind === "enter") {
        current = {
          level: 0,
          text: null,
          rangeStart: token.start.offset,
          textStart: token.start.offset,
          textEnd: token.start.offset,
        };
      } else if (current) {
        headings.push(current);
        current = null;
      }
      continue;
    }
    if (!current || kind !== "enter") {
      continue;
    }
    if (type === types.atxHeadingSequence && current.level === 0) {
      // First sequence is the opening markers; the level is its length
      current.level = token.end.offset - token.start.offset;
      current.textStart = current.textEnd = token.end.offset;
    } else if (type === types.atxHeadingText || type === types.setextHeadingText) {
      // Content span excludes ATX closing sequences already
      current.text = text.slice(token.start.offset, token.end.offset);
      current.textStart = token.start.offset;
      current.textEnd = token.end.offset;
    } else if (type === types.setextHeadingLineSequence && current.level === 0) {
      current.level = text[token.start.offset] === "=" ? 1 : 2;
    }
  }

  return headings;
}

// Offsets of the first character of every line, for offset -> (line,
// character) conversion; characters are UTF-16 code units like micromark
// offsets and LSP positions
function computeLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    offsets.push(i + 1);
  }
  return offsets;
}

function positionFromOffset(lineOffsets: number[], offset: number): Position {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineOffsets[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return Position.create(low, offset - lineOffsets[low]);
}

const headingSymbolKinds = [
  SymbolKind.File,
  SymbolKind.Module,
  SymbolKind.Namespace,
  SymbolKind.Package,
  SymbolKind.Class,
  SymbolKind.Method,
];

/**
 * Builds a hierarchical document outline from the markdown headings found in
 * the given text, parsing it with micromark (the same CommonMark parser
 * markdownlint itself uses). Both ATX ("# Heading") and setext ("Heading" +
 * "===") styles are recognized everywhere the grammar allows, including
 * inside block quotes and list items; headings inside front matter and code
 * blocks are skipped.
 */
export function outlineSymbols(text: string): DocumentSymbol[] {
  const headings = parseHeadings(text);
  const lineOffsets = computeLineOffsets(text);
  const documentEnd = positionFromOffset(lineOffsets, text.replace(/\r?\n$/, "").length);

  const symbols: DocumentSymbol[] = [];
  const stack: { level: number; children: DocumentSymbol[]; range: Range }[] = [];
  for (const heading of headings) {
    const { level } = heading;
    const name = heading.text?.replace(/\s*\n\s*/g, " ").trim() || "#".repeat(level);
    const children: DocumentSymbol[] = [];
    const symbol = DocumentSymbol.create(
      name,
      undefined,
      headingSymbolKinds[level - 1],
      Range.create(positionFromOffset(lineOffsets, heading.rangeStart), documentEnd),
      Range.create(
        positionFromOffset(lineOffsets, heading.textStart),
        positionFromOffset(lineOffsets, heading.textEnd),
      ),
      children,
    );

    while (stack.length && stack[stack.length - 1].level >= level) {
      // CocOutline includes range endpoints, so stop before the next heading's line.
      let endOffset = lineOffsets[symbol.range.start.line] - 1;
      if (text[endOffset - 1] === "\r") {
        endOffset--;
      }
      stack[stack.length - 1].range.end = positionFromOffset(lineOffsets, endOffset);
      stack.pop();
    }
    const parent = stack.length ? stack[stack.length - 1] : undefined;
    (parent ? parent.children : symbols).push(symbol);
    stack.push({ level, children, range: symbol.range });
  }

  return symbols;
}
