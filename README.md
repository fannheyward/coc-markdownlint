# coc-markdownlint

[markdownlint](https://github.com/DavidAnson/markdownlint) for Vim/Neovim, works as coc.nvim extension.

<img width="762" alt="image" src="https://user-images.githubusercontent.com/345274/66472846-abe45880-eac0-11e9-8d0a-6b923fbdbee3.png">

## Features

- Style lint
- Autofix

`<Plug>(coc-codeaction)` on current diagnostic, you will find available codeAction, choose by number to fix.

![autofix](https://user-images.githubusercontent.com/345274/66532165-f0afd400-eb40-11e9-99a7-2b30fb03e258.gif)

## Install

`:CocInstall coc-markdownlint`

## Configurations

- `markdownlint.onOpen`: lint on open a file, default `true`
- `markdownlint.onChange`: lint on changing a file, default `true`
- `markdownlint.onSave`: lint on saving a file, default `true`
- `markdownlint.config`: configurations rules used by markdownlint, default `{}`

## Commands

- `markdownlint.fixAll`: fix all errors in current file found by markdownlint

## Rules

You can configures the markdownlint rules to use, for example:

```json
{
  "default": true,
  "line_length": false
}
```

`coc-markdownlint` can read configurations from:

1. Global configuration file that [rc](https://www.npmjs.com/package/rc#standards) can find, for example `$HOME/.markdownlintrc`. Checkout `rc` for more examples.
2. `markdownlint.config` section in `coc-settings.json`
3. `.markdownlint.{json, yaml}` in local workspace root

## License

MIT

---
> This extension is created by [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
