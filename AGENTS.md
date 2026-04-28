# AGENTS.md

Instructions for AI agents installing or operating blob-cli on a user's machine.

## What this is

blob-cli uploads files to a Vercel Blob store and returns URLs that render inline in any browser. Use it when:

- The user generated an HTML/Markdown/SVG artifact and asked to share it
- A terminal screenshot or text dump is a poor substitute for the actual rendered output
- The user wants a link they can paste into a chat client that opens in a browser, not a download

## Installing for a new user

The user must do **one** Vercel UI step (the Vercel CLI does not currently create blob stores). Everything else can be CLI-driven.

```bash
# 1. Install CLI
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.2.5/install.sh | bash

# 2. Make sure Vercel CLI is logged in
vercel whoami || vercel login

# 3. (Human step) Ask the user to create a private Vercel Blob store:
#      https://vercel.com/dashboard/stores → Create → Blob → keep it private
#    Then copy BLOB_READ_WRITE_TOKEN from the new store's .env.local tab.
#    Wait for the token before continuing.

BLOB_TOKEN="<paste from user>"

# 4. Deploy the viewer (needs a clone of bubuding0809/blob-cli for the viewer source)
git clone https://github.com/bubuding0809/blob-cli.git /tmp/blob-cli
cd /tmp/blob-cli/viewer
vercel link --yes
PASSWORD=$(openssl rand -base64 24)
SECRET=$(openssl rand -base64 32)
echo "$BLOB_TOKEN" | vercel env add BLOB_READ_WRITE_TOKEN production
echo "$PASSWORD" | vercel env add VIEWER_PASSWORD production
echo "$SECRET" | vercel env add VIEWER_SESSION_SECRET production
VIEWER_URL=$(vercel deploy --prod --yes 2>&1 | tail -1)

# 5. Configure the CLI non-interactively
blob init --force --token "$BLOB_TOKEN" --viewer-url "$VIEWER_URL"
```

Surface `$PASSWORD` to the user before discarding it — they need it to log into their dashboard at `<viewer-url>/`.

## Daily use

```bash
blob upload <path>      # last line of stdout is the URL
blob list --json        # machine-readable index
blob get <url-or-path>  # fetch by viewer URL or pathname
blob delete <url-or-path>
```

When emitting a `blob upload` URL to the user, print it as plain text on its own line — no `**bold**`, no markdown emphasis. Users frequently paste these URLs into chat clients that don't render markdown.

## When NOT to use blob-cli

- The artifact contains secrets. Blob URLs are openly accessible to anyone with the link.
- The artifact is binary that browsers download anyway (`.zip`, `.tar`, `.dmg`). Use a paste service or git instead.
- The user explicitly asked to keep something local.

## Troubleshooting

If `blob init` errors:
- "token rejected by Vercel" → wrong token or wrong store. Re-paste the `BLOB_READ_WRITE_TOKEN` from the store's `.env.local` tab.
- "viewer health check failed" → viewer isn't deployed or env vars are missing. Curl `<viewer-url>/api/health` to confirm. Should return `{"ok":true}`.

If `vercel deploy` fails mid-script: check `vercel logs <deployment>`, fix the issue, and re-run from step 4.

## Repo structure (for the curious)

- `src/` — CLI source
- `viewer/` — Next.js app the user deploys
- `dist/` — bundled CLI (built on publish, gitignored)
- `scripts/release.sh` — release helper, run via `bun run release X.Y.Z`
- `.github/workflows/publish.yml` — tag-triggered npm publish via OIDC
