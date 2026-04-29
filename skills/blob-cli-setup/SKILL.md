---
name: blob-cli-setup
description: Use when the user wants to install blob-cli for the first time, or when blob-cli is installed but not yet configured (no ~/.config/blob-cli/config.json). Walks through the one-click Vercel viewer deploy (which auto-provisions a private Blob store) and non-interactive blob init.
---

# blob-cli setup

Get the user from "no blob-cli" to "ready to share files" in ~2 minutes. The Vercel Deploy Button now auto-creates the Blob store for them, so there's no dashboard side-quest.

## Preconditions

Run this check before starting:

```bash
# Node 18+
node -p "+process.versions.node.split('.')[0] >= 18" || echo "NEED_NODE"
```

The user also needs a Vercel account (free tier is fine). They will sign in / sign up in their browser when they click the Deploy URL — no CLI auth needed from your side.

## Step 1: Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.3.0/install.sh | bash
```

Verify: `blob --version` should print a version starting with `0.3`.

## Step 2: Generate dashboard credentials

Generate the password and session secret upfront so the user doesn't have to invent them:

```bash
PASSWORD=$(openssl rand -base64 24)
SECRET=$(openssl rand -base64 32)
echo "PASSWORD=$PASSWORD"
echo "SECRET=$SECRET"
```

Hold onto both — you'll surface them to the user in the next step.

## Step 3: Deploy the viewer (HUMAN REQUIRED)

The Deploy URL clones the viewer to the user's GitHub, auto-provisions a private Vercel Blob store inside their account, and prompts for two env vars. `BLOB_READ_WRITE_TOKEN` is wired automatically — the user does not paste it.

Prompt the user using your runtime's structured ask-user tool if available (e.g. Claude Code's `AskUserQuestion`, Codex's `request_user_input`), otherwise a plain message. Structured tools give the user a clear typed-answer field and are harder to miss in a busy chat:

> Click this Deploy URL — it sets up everything for you:
>
> https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer&project-name=blob-cli-viewer&repository-name=blob-cli-viewer&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D&env=VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Dashboard+password+and+a+random+32-byte+session+secret
>
> When Vercel asks for env vars, paste:
> - `VIEWER_PASSWORD`: `$PASSWORD`
> - `VIEWER_SESSION_SECRET`: `$SECRET`
>
> When the deploy finishes (~30s), paste back two things:
> 1. The viewer URL (e.g. `https://blob-cli-viewer-xxx.vercel.app`)
> 2. The `BLOB_READ_WRITE_TOKEN` — find it in the new project's **Settings → Environment Variables** (click the eye to reveal), or in **Storage → \[the new blob store\] → .env.local** tab.

Wait for both. Save them as `$VIEWER_URL` and `$BLOB_TOKEN`. Do not proceed without both.

## Step 4: Configure the CLI

```bash
blob init --force --token "$BLOB_TOKEN" --viewer-url "$VIEWER_URL"
```

Non-interactive, no prompts. If this errors:
- "token rejected" → user copied the wrong env var, or the store wasn't private. Re-check step 3.
- "viewer health check failed" → viewer didn't come up, or `VIEWER_SESSION_SECRET` wasn't set. `curl $VIEWER_URL/api/health` to debug; should return `{"ok":true}`.

## Step 5: Smoke test

```bash
echo "<h1>It works</h1>" > /tmp/blob-hello.html
blob upload /tmp/blob-hello.html
```

The last line of stdout is the URL. Confirm to the user it loads in a browser.

## When this is done

Surface the user's viewer URL and dashboard password (`$PASSWORD`) so they can find them later — the password gates the file dashboard at `<viewer-url>/`. Then the `blob-cli-share` skill takes over for everyday use.
