# blob-cli

Tiny CLI for publishing files to your Vercel Blob store and getting back a URL that renders inline in any browser. Designed for AI agents that produce HTML output you'd rather view in a browser than read in a terminal.

## How it works (BYOB + BYOV)

You bring your own:
- **Blob store** (Vercel Blob, private access)
- **Viewer** — a small Next.js app you deploy once at [`viewer/`](./viewer) that proxies blob content with inline-render headers and gives you a password-gated file dashboard

The CLI uploads to your Blob store and prints URLs that point at your viewer. Your tokens never leave your Vercel account.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.3.0/install.sh | bash
```

Or with npm directly:

```bash
npm i -g @bubuding0809/blob-cli
```

The install URL pins to a specific tag, so the script that runs is exactly the version you reviewed — never silently changed by a future commit.

## Prerequisites

- **Node.js 18 or later.** Check with `node --version`.
- **A Vercel account.** Free tier is fine. Sign up at https://vercel.com/signup.
- **5 minutes** for the one-time setup.

> Setting this up via an AI agent? See [AGENTS.md](./AGENTS.md) for the agent-driven flow.

## One-time setup

1. **Create a private Vercel Blob store.** Vercel dashboard → Storage → Create Database → Blob. Copy the `BLOB_READ_WRITE_TOKEN` from its `.env.local` tab.

2. **Deploy the viewer.** Click the button — Vercel clones [`viewer/`](./viewer) into your GitHub as `blob-cli-viewer` and prompts for three env vars:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer&project-name=blob-cli-viewer&repository-name=blob-cli-viewer&env=BLOB_READ_WRITE_TOKEN,VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Token+from+your+Blob+store%2C+a+password+for+the+dashboard%2C+and+a+random+32-byte+secret&envLink=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer%23environment-variables)

   | Var | Value |
   |---|---|
   | `BLOB_READ_WRITE_TOKEN` | the token from step 1 |
   | `VIEWER_PASSWORD` | pick anything unguessable — gates the file dashboard at `/` |
   | `VIEWER_SESSION_SECRET` | `openssl rand -base64 32` |

   Copy the deployment URL when it's live (~30s). If the button hangs on the GitHub clone step, see [`viewer/README.md`](./viewer/README.md) for a CLI fallback.

3. **Run** `blob init`. Paste the blob token, then paste the viewer URL. Done.

## First 60 seconds

After `blob init`:

```bash
echo "<h1>Hello from blob-cli</h1>" > /tmp/hello.html
blob upload /tmp/hello.html
# → https://blob-viewer-abc.vercel.app/hello-x7Ka2.html
```

That URL renders inline in any browser. Send it to a friend, drop it in a chat — the recipient clicks once and sees the page. No download, no terminal output, no copy-pasting raw HTML.

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

`init` also accepts `--token` and `--viewer-url` for non-interactive use:

```bash
blob init --force --token "$BLOB_RW_TOKEN" --viewer-url "$VIEWER_URL"
```

## Notes

- File URLs are open — anyone with a link can view. Security is the unguessable random suffix on the pathname. Don't upload secrets.
- The dashboard at `/` on the viewer is password-protected.
- Each upload gets a random suffix; you can't overwrite an existing file in place.
- BYOB+BYOV means your data is in your Vercel project. We never see, store, or proxy it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `blob init` says "token rejected by Vercel" | Token is wrong, or copied from a different store | Re-copy `BLOB_READ_WRITE_TOKEN` from Vercel store's `.env.local` tab. |
| `blob init` says "viewer health check failed" | Viewer not deployed, env vars missing, or wrong URL pasted | Open `<viewer-url>/api/health` in a browser — should return `{"ok":true}`. If 404 or 500, check viewer deploy logs on Vercel. |
| `blob upload` says "Cannot use public access on a private store" | You're on an old version of blob-cli | `npm i -g @bubuding0809/blob-cli@latest` |
| `blob` command not found after install | npm global bin dir isn't on PATH | `npm config get prefix` — add `<prefix>/bin` to PATH. |
| Need to nuke config and start over | `~/.config/blob-cli/config.json` exists | Delete the file, or run `blob init --force`. |

## Config and env vars

- Config lives at `~/.config/blob-cli/config.json` (mode 0600).
- `BLOB_READ_WRITE_TOKEN` env var overrides the stored token if set.
- `BLOB_VIEWER_URL` env var overrides the stored viewer URL if set.

## For Claude / agent users

This repo ships two pre-built skills at [`skills/`](./skills):

- [`skills/blob-cli-setup/`](./skills/blob-cli-setup) — one-time onboarding (run before anything else).
- [`skills/blob-cli-share/`](./skills/blob-cli-share) — everyday "upload and give me a URL" flow.

Install them with [`npx skills`](https://github.com/vercel-labs/skills) (works for Claude Code, Codex, Cursor, OpenCode, and 50+ other agents):

```bash
npx skills add bubuding0809/blob-cli
```

Next time the user says "share this artifact" the agent picks the right skill automatically.

Also see [`AGENTS.md`](./AGENTS.md) for a vendor-neutral install + daily-use guide.
