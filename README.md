# blob-cli

Tiny CLI for publishing files to your Vercel Blob store and getting back a URL that renders inline in any browser. Designed for AI agents that produce HTML output you'd rather view in a browser than read in a terminal.

## How it works (BYOB + BYOV)

You bring your own:
- **Blob store** (Vercel Blob, private access)
- **Viewer** — a small Next.js app you deploy once at [`viewer/`](./viewer) that proxies blob content with inline-render headers and gives you a password-gated file dashboard

The CLI uploads to your Blob store and prints URLs that point at your viewer. Your tokens never leave your Vercel account.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/main/install.sh | bash
```

Or with npm directly:

```bash
npm i -g @bubuding0809/blob-cli
```

## One-time setup

1. **Create a private Vercel Blob store.** Vercel dashboard → Storage → Create Database → Blob. Copy the `BLOB_READ_WRITE_TOKEN` from its `.env.local` tab.
2. **Deploy the viewer** using the [Deploy to Vercel button](./viewer/README.md). You'll set three env vars: the blob token, a dashboard password, and a session secret. Copy the deployment URL when it's done.
3. **Run** `blob init`. Paste the blob token, then paste the viewer URL. Done.

## Commands

```bash
blob upload report.html
# → https://blob-viewer-xxx.vercel.app/report-x7Ka2.html

blob list
# 2026-04-28T10:00:00Z   1234   https://blob-viewer-xxx.vercel.app/...

blob get <viewer-url-or-pathname> [--out file]

blob delete <viewer-url-or-pathname>
```

`list` and `delete` accept `--json` for machine-readable output.

## Notes

- File URLs are open — anyone with a link can view. Security is the unguessable random suffix on the pathname. Don't upload secrets.
- The dashboard at `/` on the viewer is password-protected.
- Each upload gets a random suffix; you can't overwrite an existing file in place.
- BYOB+BYOV means your data is in your Vercel project. We never see, store, or proxy it.
