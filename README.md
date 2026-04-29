# blob-cli

Tiny CLI for publishing files to your Vercel Blob store and getting back a URL that renders inline in any browser. Designed for AI agents that produce HTML output you'd rather view in a browser than read in a terminal.

## Why this exists

I built blob-cli for myself. I wanted my agents to have one tiny tool that takes any blob (HTML, Markdown, images, whatever) and hands back a URL. Not a sprawling SDK they have to learn before they can share what they made with me or a peer.

Lucas Meijer's [_A love letter to Pi_](https://www.youtube.com/watch?v=fdbXNWkpPMY) talk (Build Monumental, Applied Agentic Coding Meetup 2026) is what kicked this off. His point: agent artifacts are easier to consume as rendered HTML than as a wall of terminal text. Once I started leaning that way I needed a stupidly simple way to get those pages off the agent's machine and into a browser tab. blob-cli is that.

## How it works (BYOB + BYOV)

You bring your own:

- **Blob store**: Vercel Blob, private access.
- **Viewer**: a small Next.js app you deploy once at [`viewer/`](./viewer). It proxies blob content with the right inline-render headers and gives you a password-gated file dashboard.

The CLI uploads to your Blob store and prints URLs that point at your viewer. Your tokens stay in your Vercel account.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.3.0/install.sh | bash
```

Or with npm directly:

```bash
npm i -g @bubuding0809/blob-cli
```

The install URL pins to a specific tag. The script that runs is exactly the version you reviewed, never silently changed by a future commit.

## Prerequisites

- **Node.js 18 or later.** Check with `node --version`.
- **A Vercel account.** Free tier is fine. Sign up at https://vercel.com/signup.
- **5 minutes** for the one-time setup.

> **AI agents: stop here and install the skills.** This repo ships two: `blob-cli-setup` (first-time onboarding) and `blob-cli-share` (everyday "upload and give me a URL" flow). Install both with [`npx skills`](https://github.com/vercel-labs/skills), which works for Claude Code, Codex, Cursor, OpenCode, and 50+ other agents:
>
> ```bash
> npx skills add bubuding0809/blob-cli
> ```
>
> Once installed, the agent will pick up the right skill the next time the user asks to set up blob-cli or share a file. You don't need to read the rest of this README.

## One-time setup

1. **Click Deploy.** Vercel clones [`viewer/`](./viewer) into your GitHub as `blob-cli-viewer`, auto-provisions a private Blob store in your account, and prompts you for two env vars:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer&project-name=blob-cli-viewer&repository-name=blob-cli-viewer&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D&env=VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Dashboard+password+and+a+random+32-byte+session+secret&envLink=https%3A%2F%2Fgithub.com%2Fbubuding0809%2Fblob-cli%2Ftree%2Fmain%2Fviewer%23environment-variables)

   | Var                     | Value                                                          |
   | ----------------------- | -------------------------------------------------------------- |
   | `VIEWER_PASSWORD`       | anything unguessable. Gates the file dashboard at `/`.         |
   | `VIEWER_SESSION_SECRET` | `openssl rand -base64 32`                                      |

   `BLOB_READ_WRITE_TOKEN` is wired automatically when the store is created. You don't paste it. Copy the deployment URL when it's live (~30s). If the Deploy UI crashes mid-flow, see [Troubleshooting](#troubleshooting).

2. **Grab the blob token.** Open the new project on Vercel → Settings → Environment Variables → reveal `BLOB_READ_WRITE_TOKEN` and copy it. (Or: Storage → your new blob store → `.env.local` tab.)

3. **Run** `blob init`. Paste the token, then paste the viewer URL. Done.

## First 60 seconds

After `blob init`:

```bash
echo "<h1>Hello from blob-cli</h1>" > /tmp/hello.html
blob upload /tmp/hello.html
# → https://blob-viewer-abc.vercel.app/hello-x7Ka2.html
```

That URL renders inline in any browser. Send it to a friend or drop it in a chat. The recipient clicks the link and sees the page rendered. That's the whole interaction.

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

- File URLs are open. Anyone with a link can view, so don't upload secrets. The only barrier is the unguessable random suffix on the pathname.
- The dashboard at `/` on the viewer is password-protected.
- Each upload gets a random suffix; you can't overwrite an existing file in place.
- BYOB+BYOV means your data is in your Vercel project. We never see, store, or proxy it.

## Troubleshooting

| Symptom                                                          | Likely cause                                               | Fix                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `blob init` says "token rejected by Vercel"                      | Wrong env var pasted (not `BLOB_READ_WRITE_TOKEN`)         | Re-copy `BLOB_READ_WRITE_TOKEN` from your project's Settings → Environment Variables (or Storage → store → `.env.local` tab). |
| `blob init` says "viewer health check failed"                    | Viewer not deployed, env vars missing, or wrong URL pasted | Open `<viewer-url>/api/health` in a browser. It should return `{"ok":true}`. If 404 or 500, check viewer deploy logs on Vercel. |
| Deploy URL crashes with "Something went wrong" mid-provision     | Transient Vercel UI bug                                    | Check `https://vercel.com/dashboard/stores`. The store may have been created anyway. Delete the orphan and retry, or wire up manually. |
| `blob upload` says "Cannot use public access on a private store" | You're on an old version of blob-cli                       | `npm i -g @bubuding0809/blob-cli@latest`                                                                                      |
| `blob` command not found after install                           | npm global bin dir isn't on PATH                           | Run `npm config get prefix` and add `<prefix>/bin` to your PATH.                                                              |
| Need to nuke config and start over                               | `~/.config/blob-cli/config.json` exists                    | Delete the file, or run `blob init --force`.                                                                                  |

## Config and env vars

- Config lives at `~/.config/blob-cli/config.json` (mode 0600).
- `BLOB_READ_WRITE_TOKEN` env var overrides the stored token if set.
- `BLOB_VIEWER_URL` env var overrides the stored viewer URL if set.

## For Claude / agent users

If you missed the callout up top: install the skills with `npx skills add bubuding0809/blob-cli`. Source at [`skills/`](./skills).
