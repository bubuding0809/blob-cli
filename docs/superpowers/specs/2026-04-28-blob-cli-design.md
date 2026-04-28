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

## Storage Backend

**Vercel Blob.** Picked over Supabase Storage and S3/R2 because:

- One env var (`BLOB_READ_WRITE_TOKEN`) and the SDK returns public URLs directly from `put()`.
- Supabase requires a project + bucket + (often) RLS policies. The user has no DB need here.
- S3/R2 needs IAM, public-bucket policies, and (for clean URLs) a custom domain.

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

Interactive prompt for `BLOB_READ_WRITE_TOKEN`. Writes to `~/.config/blob-cli/config.json` with file mode `0600`. If the env var is already set, `init` reports that and exits.

Resolution order at runtime: env var → config file → error with link to Vercel Blob token docs.

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
- Integration tests behind a `BLOB_TEST_TOKEN` env var: actual upload → list → get → delete cycle against a real Blob store. Skipped in CI when unset.
- No mocking of the Blob SDK — its surface is small, and mocks would mask the only failure mode worth catching (auth/network).

## Open Questions

None at design time. Reserve here if review surfaces any.
