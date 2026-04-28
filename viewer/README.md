# blob viewer

A small Next.js app you deploy once on Vercel. It proxies private Vercel Blob content with the right inline-render headers and exposes a password-gated dashboard listing your files.

## Deploy

### One-click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer&project-name=blob-cli-viewer&repository-name=blob-cli-viewer&env=BLOB_READ_WRITE_TOKEN,VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Token+from+your+Blob+store%2C+a+password+for+the+dashboard%2C+and+a+random+32-byte+secret&envLink=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer%23environment-variables)

Vercel will clone the repo into your GitHub account as `blob-cli-viewer`, prompt for the three env vars below, and deploy. ~30s to a live URL.

### CLI (recommended if the button gets stuck)

The button occasionally hangs on the GitHub clone step. If that happens, do it from the CLI:

```bash
git clone https://github.com/bubuding0809/blob-cli.git /tmp/blob-cli
cd /tmp/blob-cli/viewer
vercel link --yes
echo "$BLOB_READ_WRITE_TOKEN" | vercel env add BLOB_READ_WRITE_TOKEN production
echo "$(openssl rand -base64 24)" | vercel env add VIEWER_PASSWORD production
echo "$(openssl rand -base64 32)" | vercel env add VIEWER_SESSION_SECRET production
vercel deploy --prod
```

Either way, copy the deployment URL and paste it into `blob init` on your local machine.

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
