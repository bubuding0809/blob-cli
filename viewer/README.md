# blob viewer

A small Next.js app you deploy once on Vercel. It proxies private Vercel Blob content with the right inline-render headers and exposes a password-gated dashboard listing your files.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bubuding0809/blob-cli&root-directory=viewer&env=BLOB_READ_WRITE_TOKEN,VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Token+from+your+Blob+store,+a+password+for+the+dashboard,+and+a+random+32-byte+secret&envLink=https://github.com/bubuding0809/blob-cli/tree/main/viewer%23environment-variables)

After clicking, Vercel will:
1. Clone the repo with `root-directory=viewer`.
2. Prompt for the three required env vars (see below).
3. Build and deploy. ~30s to a live URL.

Copy that URL and paste it into `blob init` on your local machine.

## Environment variables

| Var | Purpose | How to generate |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob auth (must be a **private** store) | Vercel dashboard → your Blob store → `.env.local` tab |
| `VIEWER_PASSWORD` | Password for the dashboard at `/` | Pick something unguessable |
| `VIEWER_SESSION_SECRET` | HMAC key for the session cookie | `openssl rand -base64 32` |

## What it serves

- `GET /` — password-gated file dashboard. Lists every blob in your store, sorted newest first.
- `GET /login`, `POST /api/login` — login flow (HTTP-only signed cookie, 7-day expiry).
- `GET /<pathname>` — public file proxy. Streams blob content with `Content-Disposition: inline` so HTML/Markdown/etc. render in the browser. Anyone with the URL can view; security is the random suffix on the pathname.
- `GET /api/health` — `{ ok: true }` for the CLI's `init` validation.

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
