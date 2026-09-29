// markdownlint/helpers (verified against markdownlint 0.41.x) has no type
// declarations; declare the members used here so they can be imported by
// name instead of re-implemented. Script scope on purpose: this is an
// ambient declaration for a module without types, not a module augmentation.
declare module "markdownlint/helpers" {
  /** Regular expression matching front matter (YAML, TOML, JSON) at the start of a document. */
  export const frontMatterRe: RegExp;
}
