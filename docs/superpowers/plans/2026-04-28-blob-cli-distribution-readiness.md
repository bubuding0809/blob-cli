# blob-cli Distribution Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take blob-cli from "human-installable" to "agent-installable end-to-end" by adding non-interactive init flags, agent-targeted setup docs, and a Claude skill that codifies the setup + share flows.

**Architecture:** Three phases of refinement layered on the existing CLI/viewer split. Phase 1 is code (`src/commands/init.ts`, `src/cli.ts`, tests) plus README polish. Phase 2 is `AGENTS.md` at repo root. Phase 3 is a Claude skill set under `.claude/skills/`. Each phase ships independently and adds value on its own.

**Tech Stack:** TypeScript, Bun (test + bundle), `@vercel/blob` SDK, commander, the existing `runInit` dependency-injection seams.

---

## File Structure

| File | Phase | Purpose |
|---|---|---|
| `src/commands/init.ts` | 1 | Modify — add `token` and `viewerUrl` to `InitOpts`, skip prompts when provided + valid |
| `src/cli.ts` | 1 | Modify — wire `--token` / `--viewer-url` flags through commander |
| `test/init.test.ts` | 1 | Modify — add tests for non-interactive paths and flag validation |
| `README.md` | 1 | Modify — prereqs section, troubleshooting table, copy-pasteable walkthrough |
| `AGENTS.md` | 2 | Create — agent-targeted setup using Vercel CLI + non-interactive `blob init` |
| `.claude/skills/blob-cli-setup/SKILL.md` | 3 | Create — Claude skill for one-time onboarding |
| `.claude/skills/blob-cli-share/SKILL.md` | 3 | Create — Claude skill for the everyday "share this artifact" flow |

---

## Phase 1 — Non-interactive `blob init` + better human docs

### Task 1: Extend `InitOpts` and refactor `runInit` to honor provided values

**Files:**
- Modify: `src/commands/init.ts`

**Context:** `runInit` currently runs two prompt loops (token, viewer URL). When the caller provides a value via flag, we should validate that value and skip the loop on success. If validation fails, `runInit` should error rather than fall back to interactive — non-interactive callers (agents, CI) want a clean failure, not a hung prompt.

- [ ] **Step 1: Write the failing test**

```typescript
// test/init.test.ts — add inside describe("runInit")
test("non-interactive: --token + --viewer-url skip prompts", async () => {
  const promptCalls: string[] = [];
  await runInit(
    { force: false, token: "blob_rw_ok", viewerUrl: "https://v.example.com" },
    {
      prompt: async (q: string) => { promptCalls.push(q); return ""; },
      validate: async (t) => t === "blob_rw_ok",
      validateViewer: async () => true,
      openBrowser: async () => {},
      log: () => {},
    },
  );
  expect(promptCalls).toEqual([]);
  const cfg = JSON.parse(readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"));
  expect(cfg.token).toBe("blob_rw_ok");
  expect(cfg.viewerUrl).toBe("https://v.example.com");
});

test("non-interactive: invalid --token throws without prompting", async () => {
  const promptCalls: string[] = [];
  await expect(
    runInit(
      { force: false, token: "bad", viewerUrl: "https://v.example.com" },
      {
        prompt: async (q: string) => { promptCalls.push(q); return ""; },
        validate: async () => false,
        validateViewer: async () => true,
        openBrowser: async () => {},
        log: () => {},
      },
    ),
  ).rejects.toThrow(/token/i);
  expect(promptCalls).toEqual([]);
});

test("non-interactive: invalid --viewer-url throws without prompting", async () => {
  await expect(
    runInit(
      { force: false, token: "blob_rw_ok", viewerUrl: "https://bad.example.com" },
      {
        prompt: async () => "",
        validate: async () => true,
        validateViewer: async () => false,
        openBrowser: async () => {},
        log: () => {},
      },
    ),
  ).rejects.toThrow(/viewer/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/init.test.ts -t "non-interactive"`
Expected: FAIL — `InitOpts` has no `token` / `viewerUrl` field.

- [ ] **Step 3: Update `InitOpts` and `runInit` to honor the new fields**

In `src/commands/init.ts`, change the interface and add early-exit branches before each prompt loop:

```typescript
export interface InitOpts {
  force: boolean;
  token?: string;
  viewerUrl?: string;
}
```

Then, replacing the existing token-loop block (`// Phase 1: token` through `if (!token) throw …`):

```typescript
  // Phase 1: token
  let token = "";
  if (opts.token) {
    log("Validating provided token…");
    if (!(await validate(opts.token))) {
      throw new Error("provided --token was rejected by Vercel");
    }
    token = opts.token;
  } else {
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      let candidate = await ask("Token (or Enter): ");
      if (!candidate) {
        log(`Opening ${VERCEL_BLOB_URL} in your browser…`);
        await openBrowser(VERCEL_BLOB_URL);
        log("Steps:");
        log("  1. Sign in or sign up (free).");
        log("  2. Create Database → Blob → name & region.");
        log("  3. Open the new store's '.env.local' tab.");
        log("  4. Copy the BLOB_READ_WRITE_TOKEN value (starts with 'blob_rw_').");
        candidate = await ask("Paste token here: ");
      }
      log("Validating token…");
      if (await validate(candidate)) {
        token = candidate;
        break;
      }
      attempts++;
      log(`✗ token rejected by Vercel. ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
    }
    if (!token) throw new Error(`init failed after ${MAX_ATTEMPTS} attempts`);
  }
```

And mirror the same shape for the viewer URL block (`// Phase 2: viewer URL`):

```typescript
  // Phase 2: viewer URL
  let viewerUrl = "";
  if (opts.viewerUrl) {
    const candidate = opts.viewerUrl.replace(/\/+$/, "");
    log("Validating provided viewer URL…");
    if (!(await validateV(candidate))) {
      throw new Error("provided --viewer-url did not respond at /api/health");
    }
    viewerUrl = candidate;
  } else {
    log("");
    log("Now the viewer. blob-cli needs a small Next.js app you deploy once that proxies");
    log("blobs with proper inline-render headers and serves a private file dashboard.");
    log("Deploy the viewer (root-directory=viewer) at:");
    log("  https://github.com/bubuding0809/blob-cli#viewer");
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      const candidate = (await ask("Viewer URL (e.g. https://blob-viewer-xxx.vercel.app): ")).replace(/\/+$/, "");
      if (!candidate) {
        log("");
        log("To deploy the viewer:");
        log("  1. Open https://github.com/bubuding0809/blob-cli#viewer");
        log("  2. Click the 'Deploy with Vercel' button.");
        log("  3. Set BLOB_READ_WRITE_TOKEN, VIEWER_PASSWORD, VIEWER_SESSION_SECRET as prompted.");
        log("  4. Once deployed, copy the URL and paste it below.");
        continue;
      }
      log("Validating viewer…");
      if (await validateV(candidate)) {
        viewerUrl = candidate;
        break;
      }
      attempts++;
      log(`✗ viewer health check failed. ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
    }
    if (!viewerUrl) throw new Error(`init failed after ${MAX_ATTEMPTS} attempts`);
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `bun test test/init.test.ts`
Expected: PASS — all existing interactive tests still green, three new non-interactive tests green.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS — no regressions in other suites.

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts test/init.test.ts
git commit -m "init: support --token and --viewer-url for non-interactive setup"
```

### Task 2: Wire `--token` / `--viewer-url` flags through commander

**Files:**
- Modify: `src/cli.ts`

**Context:** `cli.ts` is the commander entry point. The existing `init` command only accepts `--force`. We add the two new flags and pass them through to `runInit`.

- [ ] **Step 1: Add the flags**

In `src/cli.ts`, replace the existing `program.command("init")` block with:

```typescript
program
  .command("init")
  .description("Set up your Vercel Blob token (one-time onboarding).")
  .option("--force", "overwrite existing config or env-set token")
  .option("--token <token>", "Vercel Blob read/write token (skips token prompt)")
  .option("--viewer-url <url>", "Deployed viewer URL (skips viewer prompt)")
  .action(async (opts) =>
    runInit({
      force: !!opts.force,
      token: opts.token,
      viewerUrl: opts.viewerUrl,
    }),
  );
```

- [ ] **Step 2: Manual smoke-test build + invocation**

Run: `bun run build && node dist/cli.js init --help`
Expected: help output lists `--token` and `--viewer-url` alongside `--force`.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "cli: expose --token and --viewer-url flags on init"
```

### Task 3: README — prereqs, walkthrough, troubleshooting

**Files:**
- Modify: `README.md`

**Context:** Current README is functional but assumes the reader knows Vercel basics. Add a prereqs list, a copy-pasteable "first 60 seconds" walkthrough, and a troubleshooting table for the most common init failures. Cross-link the future `AGENTS.md` so agents reading the repo find their entry point.

- [ ] **Step 1: Insert a Prereqs section after the Install section**

Insert this block in `README.md` between the existing "## Install" block and "## One-time setup":

```markdown
## Prerequisites

- **Node.js 18 or later.** Check with `node --version`.
- **A Vercel account.** Free tier is fine. Sign up at https://vercel.com/signup.
- **5 minutes** for the one-time setup.

> Setting this up via an AI agent? See [AGENTS.md](./AGENTS.md) for the agent-driven flow.
```

- [ ] **Step 2: Replace the "Commands" section with a "First 60 seconds" walkthrough first**

Add this above the existing "## Commands" section:

```markdown
## First 60 seconds

After `blob init`:

```bash
# upload an HTML file and get a URL that renders inline
blob upload my-deck.html
# → https://blob-viewer-abc.vercel.app/my-deck-x7Ka2.html

# share that URL anywhere — it opens in a browser, no download
```

That's the whole point of the tool. Everything else is convenience.
```

- [ ] **Step 3: Append a Troubleshooting section after Notes**

Add at the bottom of `README.md`:

```markdown
## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `blob init` says "token rejected by Vercel" | Token is wrong, or store is region-restricted from your IP | Re-copy `BLOB_READ_WRITE_TOKEN` from Vercel `.env.local` tab. Tokens start with `blob_rw_`. |
| `blob init` says "viewer health check failed" | Viewer not deployed, env vars missing, or wrong URL pasted | Visit `<viewer-url>/api/health` in a browser — should return `{"ok":true}`. If 404 or 500, check viewer deploy logs on Vercel. |
| `blob upload` says "Cannot use public access on a private store" | You're on an old version of blob-cli | `npm i -g @bubuding0809/blob-cli@latest` |
| `blob` command not found after install | `npm` global bin dir isn't on PATH | `npm config get prefix` — add `<prefix>/bin` to PATH. |
| Need to nuke config and start over | `~/.config/blob-cli/config.json` exists | Delete the file, or run `blob init --force`. |

## Config and env vars

- Config lives at `~/.config/blob-cli/config.json` (mode 0600).
- `BLOB_READ_WRITE_TOKEN` env var overrides the stored token if set.
- `BLOB_VIEWER_URL` env var overrides the stored viewer URL if set.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: prereqs, first-60-seconds walkthrough, troubleshooting table"
```

---

## Phase 2 — AGENTS.md

### Task 4: Write `AGENTS.md` for agent-driven setup

**Files:**
- Create: `AGENTS.md`

**Context:** `AGENTS.md` is a vendor-neutral convention (used by Codex, Cursor, Copilot CLI, Claude Code). When an agent works in or installs this repo, it reads `AGENTS.md` for instructions. The setup flow is: install CLI, deploy viewer via Vercel CLI, ask user for blob token (only step that requires the dashboard today), run `blob init` non-interactively. Be honest about the manual step — don't pretend the agent can create a Vercel Blob store.

- [ ] **Step 1: Create the file**

Write `AGENTS.md` at the repo root:

````markdown
# AGENTS.md

Instructions for AI agents installing or operating blob-cli on a user's machine.

## What this is

blob-cli uploads files to a Vercel Blob store and returns URLs that render inline in a browser. It's the right tool when:
- The user generated an HTML/Markdown/SVG artifact and asked you to share it
- A terminal screenshot or text dump is a poor substitute for the actual rendered output

## Installing for a new user

The user must do **one** Vercel UI step (the dashboard has no CLI to create blob stores). Everything else can be CLI-driven.

```bash
# 1. Install CLI
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.2.5/install.sh | bash

# 2. Ensure Vercel CLI is logged in
vercel whoami || vercel login

# 3. (Human step) Ask the user to create a private Vercel Blob store:
#    https://vercel.com/dashboard/stores → Create → Blob → private
#    Then copy BLOB_READ_WRITE_TOKEN from the .env.local tab.
#    Wait for the user to paste the token before continuing.

# 4. Deploy the viewer (run from a clone of bubuding0809/blob-cli)
git clone https://github.com/bubuding0809/blob-cli.git /tmp/blob-cli
cd /tmp/blob-cli/viewer
vercel link --yes
vercel env add BLOB_READ_WRITE_TOKEN production <<< "$BLOB_TOKEN_FROM_USER"
vercel env add VIEWER_PASSWORD production <<< "$(openssl rand -base64 24)"
vercel env add VIEWER_SESSION_SECRET production <<< "$(openssl rand -base64 32)"
VIEWER_URL=$(vercel deploy --prod --yes | tail -1)

# 5. Configure the CLI non-interactively
blob init --force --token "$BLOB_TOKEN_FROM_USER" --viewer-url "$VIEWER_URL"
```

Surface the `VIEWER_PASSWORD` to the user before discarding it — they need it to access their dashboard at `<viewer-url>/`.

## Daily use

```bash
blob upload <path>      # prints the inline-render URL
blob list --json        # machine-readable index
blob get <url-or-path>  # fetch by URL or pathname
blob delete <url-or-path>
```

`blob upload` exits 0 on success; the last line of stdout is the URL. Parse that, don't try to be clever about JSON output for upload — there isn't a `--json` flag on upload.

## When NOT to use blob-cli

- The artifact contains secrets. Blob URLs are unguessable but openly accessible to anyone with the link.
- The artifact is binary that browsers download anyway (zip, tar). Use a paste service or git instead.
- The user explicitly asked to keep something local.

## Troubleshooting

If `blob init` errors:
- "token rejected by Vercel" → wrong token or wrong store. Re-paste the `BLOB_READ_WRITE_TOKEN` from `.env.local` tab.
- "viewer health check failed" → viewer not deployed yet, or env vars missing. Curl `<viewer-url>/api/health` directly to debug.

If `vercel deploy` errors mid-script, check `vercel logs <viewer-url>` and re-run from step 4.
````

- [ ] **Step 2: Cross-link from README**

In `README.md`, the prereqs block already mentions AGENTS.md from Phase 1 task 3. No further change needed.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "AGENTS.md: agent-driven install + daily-use guide"
```

---

## Phase 3 — Claude skill

### Task 5: Setup skill — `.claude/skills/blob-cli-setup/SKILL.md`

**Files:**
- Create: `.claude/skills/blob-cli-setup/SKILL.md`

**Context:** Claude skills are markdown files with YAML frontmatter that get loaded into an agent's available actions. A "setup" skill should fire when the user first wants to use blob-cli. It walks through the same flow as AGENTS.md but in skill format — concise, action-oriented, and identifies the one human-required step explicitly.

- [ ] **Step 1: Create the skill file**

```markdown
---
name: blob-cli-setup
description: Use when the user wants to install blob-cli for the first time, OR has the CLI installed but no config (blob init has never been run). Walks through Vercel Blob store creation, viewer deploy, and non-interactive blob init.
---

# blob-cli setup

Get the user from "no blob-cli" to "ready to share files" in ~5 minutes.

## Preconditions

Check these before starting:
- `command -v node && node -p "+process.versions.node.split('.')[0] >= 18"` — Node 18+
- `command -v vercel || npm i -g vercel` — Vercel CLI
- `vercel whoami` succeeds — user is logged into Vercel

If any fail, fix them first.

## Step 1: Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.2.5/install.sh | bash
```

Verify: `blob --version` should print a version starting with `0.2`.

## Step 2: Get a Vercel Blob token (HUMAN REQUIRED)

Vercel does not expose blob-store creation via CLI. Tell the user:

> "I need you to create a private Vercel Blob store:
> 1. Open https://vercel.com/dashboard/stores
> 2. Click Create → Blob → keep it private
> 3. Open the new store's `.env.local` tab
> 4. Copy the `BLOB_READ_WRITE_TOKEN` (starts with `blob_rw_`) and paste it here"

Wait for the token. Do not proceed without it.

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

Tell the user their dashboard password (`$PASSWORD`) and viewer URL.

## Step 4: Configure the CLI

```bash
blob init --force --token "$BLOB_TOKEN" --viewer-url "$VIEWER_URL"
```

This is non-interactive — no prompts. If it errors, debug `<viewer-url>/api/health` and re-run.

## Step 5: Smoke test

```bash
echo "<h1>It works</h1>" > /tmp/hello.html
blob upload /tmp/hello.html
```

Last line of stdout is the URL. Confirm to the user that it loads in a browser.

## Common failures

- `vercel link` errors out → user hasn't run `vercel login`. Have them do that first.
- `blob init` rejects the token → store wasn't created with private access, or wrong store's token was copied.
- Health check fails → viewer deploy succeeded but env vars missing. Re-run `vercel env add` and redeploy.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/blob-cli-setup/SKILL.md
git commit -m "skill: blob-cli-setup — agent-guided onboarding"
```

### Task 6: Share skill — `.claude/skills/blob-cli-share/SKILL.md`

**Files:**
- Create: `.claude/skills/blob-cli-share/SKILL.md`

**Context:** This is the everyday-use skill. Fires when the user generated something and wants it shared via a browser-friendly URL. Much simpler than setup — assumes config already exists.

- [ ] **Step 1: Create the skill file**

```markdown
---
name: blob-cli-share
description: Use when the user wants to share a generated artifact (HTML deck, SVG, markdown, image) via a browser-renderable URL. Uses blob-cli to upload and returns the URL. Requires blob-cli to be already configured — if not, point at blob-cli-setup first.
---

# Share an artifact via blob-cli

## When this fires

The user said something like:
- "Share this with my friend"
- "Send me the link to view"
- "Get me a URL for this"
- "I want to open this in a browser, not the terminal"

…and you have a file at a known path on the user's machine.

## Preflight

```bash
command -v blob || { echo "blob-cli not installed; use blob-cli-setup skill"; exit 1; }
test -f ~/.config/blob-cli/config.json || { echo "blob-cli not configured; use blob-cli-setup skill"; exit 1; }
```

If either check fails, stop and run the setup skill first.

## Upload

```bash
blob upload <path-to-file>
```

The last line of stdout is the URL. Output it to the user as a plain URL on its own line — do not wrap it in `**bold**` or any other markdown emphasis. The user copies these into chat clients that may not render markdown.

## Notes

- HTML, SVG, Markdown render inline in the browser thanks to the viewer's `Content-Disposition: inline` header.
- File URLs are openly accessible to anyone with the link. Don't upload anything sensitive.
- Each upload gets a random suffix; you can't overwrite an existing file. Re-upload to get a fresh URL.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/blob-cli-share/SKILL.md
git commit -m "skill: blob-cli-share — everyday upload-and-share flow"
```

### Task 7: Cross-link skills from README

**Files:**
- Modify: `README.md`

**Context:** Future Claude users reading the README should see that skills exist and where to find them.

- [ ] **Step 1: Add a "For Claude users" subsection**

Append to `README.md`:

```markdown
## For Claude / agent users

This repo includes:
- [`AGENTS.md`](./AGENTS.md) — vendor-neutral setup instructions for any agent.
- [`.claude/skills/blob-cli-setup/`](./.claude/skills/blob-cli-setup/) — Claude skill for one-time onboarding.
- [`.claude/skills/blob-cli-share/`](./.claude/skills/blob-cli-share/) — Claude skill for the everyday "share this artifact" flow.

To install the skills into your Claude Code:
```bash
mkdir -p ~/.claude/skills
cp -r .claude/skills/blob-cli-* ~/.claude/skills/
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "README: link AGENTS.md and Claude skills"
```

---

## Final Task — Release

### Task 8: Release v0.3.0

**Files:** none (helper script does everything)

**Context:** Phase 1 changes the CLI surface (new flags) so this is a minor bump (0.2.5 → 0.3.0). Phases 2 and 3 are docs/skills that ride along. Use the `bun run release` helper we built earlier.

- [ ] **Step 1: Verify clean state**

Run: `git status`
Expected: working tree clean, on `main`.

- [ ] **Step 2: Run the release helper**

Run: `bun run release 0.3.0`

Expected: bumps `package.json` to 0.3.0, bumps the README install URL to `v0.3.0`, runs tests + build, commits, tags `v0.3.0`, pushes.

- [ ] **Step 3: Watch the publish**

Run: `gh run watch -R bubuding0809/blob-cli`
Expected: workflow succeeds with provenance.

- [ ] **Step 4: Smoke test the published install**

```bash
npm uninstall -g @bubuding0809/blob-cli
curl -fsSL https://raw.githubusercontent.com/bubuding0809/blob-cli/v0.3.0/install.sh | bash
blob --version  # → 0.3.0
blob init --help  # → shows --token and --viewer-url
```

Expected: clean install, new flags visible.
