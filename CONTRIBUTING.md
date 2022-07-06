# Contributing

## Testing a change in coc.nvim

If you build a change and want to test it, you can do the following:

- Raise your PR
  - Fork the repo
  - Create a PR branch, e.g. `my-pr-branch`
  - Make your change
  - Raise a PR from that branch
- Create another branch, e.g. `prebuilt`, based on `my-pr-branch`
  - Build the code with `yarn build`.
  - Comment out the `lib/` line in the `.gitignore` file.
  - Add `lib/index.js`
  - Work around [this issue][] by replacing `new URL` with `new (require("url").URL)` in `lib/index.js`
  - commit, push
  - Change your fork's default branch to `prebuilt`
  - Run `:CocUninstall coc-markdownlint`
  - Run `:CocInstall https://github.com/<my-username>/coc-markdownlint`

[this issue]: https://github.com/fannheyward/coc-markdownlint/issues/446#issuecomment-928576266
