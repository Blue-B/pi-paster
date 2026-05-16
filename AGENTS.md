<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->

# paster Project Guide

## What this project is

`paster` is a pi extension package. Its goal is to make pasted or drag-dropped image paths behave like first-class image attachments in pi interactive mode.

Target behavior:

1. User pastes or drag-drops an image path.
2. The editor replaces the raw path with a placeholder like `[#image1]`.
3. The extension stores the image payload immediately.
4. On submit, the user text is sent with placeholders preserved and matching image blocks attached to the same user turn.

Read `spec.md` before changing product behavior. It is the source of truth for UX, edge cases, MVP scope, and acceptance criteria.

## Important files

- `spec.md` — product spec and implementation plan.
- `src/index.ts` — pi extension entrypoint and implementation.
- `tests/` — Vitest tests run through Vite+.
- `package.json` — package metadata, scripts, peer dependencies, and `pi.extensions` manifest.
- `vite.config.ts` — Vite+ config for packing, Oxc formatting/linting, type checking, and tests.
- `tsconfig.json` — TypeScript settings.

## How to run it

Install dependencies:

```bash
vp install
```

Run checks:

```bash
vp check
vp test run
```

Build package output:

```bash
vp run build
```

Try the extension locally in pi:

```bash
pi -e .
```

## Implementation notes

- The extension entrypoint is `src/index.ts` and must default-export a function receiving `ExtensionAPI`.
- Pi discovers this package through `package.json`:

  ```json
  {
    "pi": {
      "extensions": ["./src/index.ts"]
    }
  }
  ```

- Keep pi core packages used by the extension as peer dependencies for consumers:
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-tui`
- Do not add slash commands or LLM-callable tools for the MVP; the extension should work automatically from paste/edit/submit behavior.
- Use `CustomEditor` for editor customization so pi app keybindings continue to work.
- Do not override private pi editor methods. Intercept paste/control sequences through public editor APIs such as `handleInput()` and `insertTextAtCursor()`.
- Use `pi.on("input", ...)` to transform submitted text and attach image content.
- Attachment state should be in-memory for the MVP and reset on session lifecycle changes.
- Keep image parsing and MIME detection helper functions small and unit-testable.

## Testing guidance

- Put fast unit tests under `tests/` and import test helpers from `vite-plus/test`.
- Prefer unit tests for parsing, path resolution, MIME detection, attachment ordering, and placeholder matching.
- Use manual pi testing for TUI behavior that is difficult to automate:
  - normal text paste still works
  - image path paste becomes `[#imageN]`
  - multiple image paths preserve order
  - deleting a placeholder prevents attachment
  - pi keybindings still work

Before handing off changes, run:

```bash
vp check
vp test run
```

If implementation changed package output, also run:

```bash
vp run build
```

## Documentation references

When working on pi extension APIs, consult the local pi docs first:

- Extensions: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- TUI/custom editor APIs: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
- Package manifests: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`
- Extension examples: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/`

For Vite+ commands/config, use local docs in `node_modules/vite-plus/docs` or https://viteplus.dev/guide/.
