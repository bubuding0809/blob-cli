# blob-cli — Design

**Date:** 2026-04-28
**Status:** Draft, pending user review

## Problem

When an AI agent produces long-form output (reports, analyses, dashboards), reading it as raw markdown in a terminal is painful. The user wants a fast, no-rebuild path for the agent to publish HTML (or any static file) and get back a URL viewable from any browser.

## Goals

- One short shell command to publish a file → get a public URL.
- Round-trip (upload to URL-loadable) measured in seconds, not minutes. No app rebuild, no deploy step.
- Full CRUD: agent can list, fetch, and delete prior uploads.
- Installable via `npm i -g blob-cli` (or `npx blob-cli ...`) — no Bun runtime required for end users.

## Non-Goals

- No private / signed-URL flow. Everything is public. (Adversaries guessing the random suffix is the only protection. Don't upload secrets.)
- No web UI / dashboard. The CLI is the only interface.
- No multi-user auth. Single token, single user.
- No file expiry / TTL in v1. Files live until explicitly deleted.
- **No centrally hosted service.** Users bring their own Vercel Blob store and token (BYOB — see "Onboarding" below). We never see, store, or proxy user data.

## Storage Backend

**Vercel Blob.** Picked over Supabase Storage and S3/R2 because:

- One env var (`BLOB_READ_WRITE_TOKEN`) and the SDK returns public URLs directly from `put()`.
- Supabase requires a project + bucket + (often) RLS policies. The user has no DB need here.
- S3/R2 needs IAM, public-bucket policies, and (for clean URLs) a custom domain.

## Onboarding — BYOB (Bring Your Own Blob)

The CLI is a thin client. There is no central server, no shared infrastructure, no hosted user accounts. Each user provides their own Vercel Blob store and token; their data lives in their own Vercel project.

**Why this model:**

- Zero ops on the maintainer side — no servers, no costs, no abuse story.
- Privacy by construction: we never touch user files.
- Free tier on Vercel Blob (1 GB storage, generous bandwidth) is enough for typical use.
- Same shape as `vercel`, `gh`, `aws` — familiar to developers.

**Cost: a one-time setup at install.** Mitigated by `blob init` (below), which opens the right Vercel page and walks the user through it.

If, in the future, we ever want a hosted-shared model (we run a store, users get accounts on us), that's a separate, much larger project (auth, billing, abuse, ToS) and explicitly out of scope here.

## Runtime & Distribution

- **Dev runtime:** Bun. Native TS, fast iteration.
- **Source language:** TypeScript, written runtime-agnostically (no `Bun.*` APIs).
- **Build:** `bun build --target=node` produces a single bundled JS file with a `#!/usr/bin/env node` shebang.
- **Distribution:** npm package. `bin: { "blob": "dist/cli.js" }` so `npx blob` works without a global install.

This means:
- The user gets Bun DX during development.
- End users (including future-them on a fresh machine) install with `npm i -g blob-cli` — no Bun required.

## Commands

All commands print human-readable output by default; `--json` switches to machine-readable JSON for the agent.

### `blob init`

Onboarding flow for first-time users. Goal: get from "I just installed this" to "I have a working token saved" in under a minute.

**Flow:**

1. Greet, explain BYOB in one sentence.
2. Branch on whether the user already has a token:
   - **Has token** → paste it now.
   - **No token / Enter** → open `https://vercel.com/dashboard/stores` in the default browser (`open` on macOS, `xdg-open` on Linux, `start` on Windows). Print copy-paste-able steps:
     1. Sign in or sign up (free).
     2. *Create Database* → *Blob* → name it, pick a region.
     3. Open the new store's *.env.local* tab.
     4. Copy the value of `BLOB_READ_WRITE_TOKEN` (starts with `blob_rw_`).
   - Then prompt for the token.
3. Validate the token by calling `list({ limit: 1 })`. If it fails, print the error and re-prompt (up to 3 attempts). This catches typos and expired tokens at init time, not first upload.
4. Write to `~/.config/blob-cli/config.json` with file mode `0600`. Print save location and a "try this next" hint.

**Idempotence:** if config already exists, prompt for confirm before overwriting (`--force` skips the prompt). Useful for token rotation.

**Env var precedence:** if `BLOB_READ_WRITE_TOKEN` is already set in the environment, `init` says so and exits without writing. Pass `--force` to write anyway (so the saved token is used in shells where the env var isn't set).

**Resolution order at runtime:** env var → config file → error message that points to `blob init`.

### `blob upload <path> [--name <name>] [--json]`

- Reads the file at `<path>`.
- Calls `put(name, content, { access: 'public', addRandomSuffix: true })`.
- `--name` defaults to the file's basename. Random suffix prevents collisions.
- Content type inferred from extension (`text/html`, `text/plain`, `application/json`, etc.); falls back to `application/octet-stream`.
- Prints the resulting URL on stdout (one line, no decoration in `--json` mode either — single string field `{ "url": "..." }`).

### `blob list [--prefix <prefix>] [--limit <n>] [--json]`

Calls `list({ prefix, limit })`. Default limit 100. Default-format output: one line per file, `<uploaded-at>\t<size>\t<url>`.

### `blob get <url-or-pathname> [--out <path>]`

Fetches the blob. With `--out`, writes to the given path. Without, streams to stdout (useful for piping). Accepts either the full URL returned by `upload` or a pathname (looked up via `list`).

### `blob delete <url-or-pathname>`

Calls `del(url)`. Accepts the same identifier forms as `get`. Prints `deleted: <url>` on success.

## Project Structure

```
blob-cli/
├── package.json          # bin entry, scripts, deps (@vercel/blob, commander)
├── tsconfig.json
├── src/
│   ├── cli.ts            # entrypoint, command routing (commander)
│   ├── commands/
│   │   ├── init.ts
│   │   ├── upload.ts
│   │   ├── list.ts
│   │   ├── get.ts
│   │   └── delete.ts
│   ├── config.ts         # token resolution (env → file → error)
│   └── output.ts         # human vs --json formatting helpers
├── test/                 # bun test
└── dist/                 # build output, gitignored
```

Each command file exports one function. `cli.ts` only does argument parsing and dispatch — no business logic. Keeps each unit small enough to reason about in isolation.

## Dependencies

- `@vercel/blob` — official SDK.
- `commander` — argument parsing. Mature, small, well-known.
- `mime-types` — content-type lookup for `upload`.

No other runtime deps. Test deps via `bun test` (built-in).

## Error Handling

- Missing token: print one-line error referencing `blob init` and exit 1.
- Network failure / 4xx / 5xx from Vercel: surface the SDK error message, exit 1. Do not retry — agent can re-invoke.
- File not found on `upload`: standard `ENOENT`, exit 1.
- `--json` mode: errors emitted as `{ "error": "..." }` on stderr, same exit codes.

## Testing

- Unit tests for `config.ts` (token resolution precedence) and `output.ts` (formatting).
- Unit test for `init` flow's token validation (mock the SDK only here, since the goal is testing the retry/error UX, not the SDK).
- Integration tests behind a `BLOB_TEST_TOKEN` env var: actual upload → list → get → delete cycle against a real Blob store. Skipped in CI when unset.
- No mocking of the Blob SDK in integration tests — its surface is small, and mocks would mask the only failure mode worth catching (auth/network).

## Open Questions

None at design time. Reserve here if review surfaces any.
