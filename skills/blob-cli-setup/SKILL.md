---
name: blob-cli-setup
description: Use when the user wants to install blob-cli for the first time, or when blob-cli is installed but not yet configured (no ~/.config/blob-cli/config.json). Walks through Vercel Blob store creation, viewer deploy, and non-interactive blob init.
---

# blob-cli setup

Get the user from "no blob-cli" to "ready to share files" in ~5 minutes.

## Preconditions

Run these checks before starting:

```bash
# Node 18+
node -p "+process.versions.node.split('.')[0] >= 18" || echo "NEED_NODE"
# Vercel CLI
command -v vercel || echo "NEED_VERCEL_CLI"
# Vercel logged in
vercel whoami 2>/dev/null || echo "NEED_VERCEL_LOGIN"
```

Fix anything that fails before continuing. To install Vercel CLI: `npm i -g vercel`. To log in: `vercel login` (the user must complete the OAuth flow themselves).

## Step 1: Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.3.0/install.sh | bash
```

Verify: `blob --version` should print a version starting with `0.2`.

## Step 2: Get a Vercel Blob token (HUMAN REQUIRED)

Vercel does not expose blob-store creation via CLI — the user must do this part in the dashboard.

Prompt the user using your runtime's structured ask-user tool if available (e.g. Claude Code's `AskUserQuestion`, Codex's `request_user_input`), otherwise a plain message. Structured tools give the user a clear typed-answer field and are harder to miss in a busy chat:

> "Create a private Vercel Blob store:
> 1. Open https://vercel.com/dashboard/stores
> 2. Click Create → Blob → keep it private
> 3. Open the new store's `.env.local` tab
> 4. Copy the `BLOB_READ_WRITE_TOKEN` value and paste it back here"

Wait for the token. Save it as `$BLOB_TOKEN`. Do not proceed without it.

## Step 3: Deploy the viewer

```bash
git clone https://github.com/bubuding0809/blob-cli.git /tmp/blob-cli
cd /tmp/blob-cli/viewer
vercel link --yes
PASSWORD=$(openssl rand -base64 24)
SECRET=$(openssl rand -base64 32)
echo "$BLOB_TOKEN" | vercel env add BLOB_READ_WRITE_TOKEN production
echo "$PASSWORD" | vercel env add VIEWER_PASSWORD production
echo "$SECRET" | vercel env add VIEWER_SESSION_SECRET production
VIEWER_URL=$(vercel deploy --prod --yes 2>&1 | tail -1)
```

Tell the user their dashboard password (`$PASSWORD`) and viewer URL — they need both. The password lets them browse their files; the URL is where their uploads will live.

## Step 4: Configure the CLI

```bash
blob init --force --token "$BLOB_TOKEN" --viewer-url "$VIEWER_URL"
```

Non-interactive, no prompts. If this errors:
- "token rejected" → wrong token, or store wasn't private. Re-check step 2.
- "viewer health check failed" → viewer didn't come up. `curl $VIEWER_URL/api/health` to debug; should return `{"ok":true}`.

## Step 5: Smoke test

```bash
echo "<h1>It works</h1>" > /tmp/blob-hello.html
blob upload /tmp/blob-hello.html
```

The last line of stdout is the URL. Confirm to the user it loads in a browser.

## When this is done

Save the user's viewer URL and dashboard password somewhere they can find them. Then the `blob-cli-share` skill takes over for everyday use.
