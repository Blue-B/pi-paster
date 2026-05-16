# paster

A pi extension package for turning pasted or drag-dropped image paths into first-class image attachments.

See [`spec.md`](./spec.md) for the product and implementation plan.

## Development

This repo uses Vite+ via `vp` with pnpm.

```bash
vp install
vp check
vp test
vp run build
```

## Try locally in pi

```bash
pi -e .
```

The package manifest exposes the extension through:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```
