# blob viewer

A small Next.js app you deploy once on Vercel. It proxies private Vercel Blob content with the right inline-render headers and exposes a password-gated dashboard listing your files.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer&project-name=blob-cli-viewer&repository-name=blob-cli-viewer&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D&env=VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Dashboard+password+and+a+random+32-byte+session+secret&envLink=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer%23environment-variables)

Vercel will clone the repo into your GitHub account as `blob-cli-viewer`, auto-provision a private Blob store in your account (wiring `BLOB_READ_WRITE_TOKEN` for you), prompt for the two env vars below, and deploy. About 30 seconds to a live URL.

If the Deploy UI crashes with "Something went wrong" mid-flow, the store may have been created anyway. Check https://vercel.com/dashboard/stores. If an orphan is sitting there, delete it and click Deploy again.

Once it's live, copy the deployment URL and paste it into `blob init` on your local machine.

## Environment variables

| Var | Purpose | How to get it |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob auth (must be a private store) | Auto-injected by the Deploy button. You don't paste this. |
| `VIEWER_PASSWORD` | Password for the dashboard at `/` | Pick something unguessable |
| `VIEWER_SESSION_SECRET` | HMAC key for the session cookie | `openssl rand -base64 32` |

## What it serves

- `GET /`: password-gated file dashboard. Lists every blob in your store, sorted newest first.
- `GET /login`, `POST /api/login`: login flow (HTTP-only signed cookie, 7-day expiry).
- `GET /<pathname>`: public file proxy. Streams blob content with `Content-Disposition: inline` so HTML, Markdown, and the like render in the browser. Anyone with the URL can view; the only barrier is the random suffix on the pathname.
- `GET /api/health`: returns `{ ok: true }` for the CLI's `init` validation.

## Local development

```bash
cd viewer
cp .env.example .env.local
# fill in real values
bun install
bun run dev
```

## Tests

```bash
bun test
```
