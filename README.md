# blob-cli

Tiny CLI for publishing static files to your Vercel Blob store and getting back a public URL. Designed for AI agents that produce HTML output you'd rather view in a browser than read in a terminal.

## Install

```bash
npm i -g blob-cli
# or
npx blob-cli <command>
```

## One-time setup (BYOB)

You bring your own Vercel Blob store. Run:

```bash
blob init
```

It walks you through creating a free Vercel Blob store and pasting the token. The token is saved to `~/.config/blob-cli/config.json` (mode `0600`).

You can also set `BLOB_READ_WRITE_TOKEN` in your shell — that takes precedence.

## Commands

```bash
blob upload report.html
# → https://<store>.public.blob.vercel-storage.com/report-x7Ka2.html

blob list
# 2026-04-28T10:00:00Z   1234   https://...

blob get <url-or-pathname> [--out file]

blob delete <url-or-pathname>
```

All commands accept `--json` for machine-readable output.

## Notes

- Uploads are **public** — anyone with the URL can read them. Don't upload secrets.
- Each upload gets a random suffix; you can't overwrite an existing file in place.
- BYOB means your data is in your Vercel project. We never see, store, or proxy it.
