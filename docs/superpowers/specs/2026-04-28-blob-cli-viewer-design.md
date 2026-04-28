# blob-cli viewer pivot — design

**Status:** spec, awaiting plan
**Supersedes (partially):** `2026-04-28-blob-cli-design.md` — the original spec assumed Vercel Blob could serve HTML inline. It can't; Vercel forces `Content-Disposition: attachment` on every response and exposes no SDK option to override. This spec replaces the "publish HTML, view via blob URL" mechanism while keeping the rest of the CLI's shape.

---

## 1. Goal

Restore the original use case — *AI agent publishes an HTML report; a human views it in a browser via a URL* — by introducing a small user-deployed Next.js viewer that proxies blob content with proper headers. The viewer doubles as a private file browser for the user's blob store.

## 2. Why the change

- Vercel Blob forces `Content-Disposition: attachment` for HTML, Markdown, and most text formats. Files always download instead of rendering. Verified by inspecting response headers and SDK options across `@vercel/blob` 0.27.x and 2.3.x.
- "Switch to private store, share via signed URLs" is not viable: Vercel Blob has no presigned-download-URL feature. Sharing private blobs requires a server-side proxy.
- The current CLI works fine for inline-eligible types (images, PDFs, plain text, JSON, XML, audio, video) but fails the original "browser-viewable HTML report" intent.

## 3. Architecture

```
                 ┌──────────────────┐
                 │ user's terminal  │
                 │   (blob upload)  │
                 └────────┬─────────┘
                          │ put/list/delete via SDK
                          ▼
            ┌─────────────────────────────┐
            │  Vercel Blob (private)      │
            │  user-owned store           │
            └─────────────▲───────────────┘
                          │ get(pathname, {access:"private"})
                          │   server-side, with token
                          │
      ┌───────────────────┴───────────────────────┐
      │  Viewer (Vercel deployment)               │
      │  user-owned, deployed once                │
      │  • GET /login, POST /api/login → cookie   │
      │  • GET /         → password-gated browser │
      │  • GET /:path    → public, inline render  │
      │  • GET /api/health → 200 OK               │
      └───────────────────▲───────────────────────┘
                          │ HTTPS
                          │
                     ┌────┴────┐
                     │ browser │
                     └─────────┘
```

Three artifacts, all user-owned:

1. **Vercel Blob store** (private access). Holds files.
2. **Viewer deployment** (Next.js, one-time deploy). Holds the read token as an env var; gates the dashboard.
3. **CLI** (this repo). Uploads/lists/gets/deletes via SDK directly using the same token.

No shared backend. No third-party trust. Tokens never leave the user's Vercel account.

## 4. Auth model — split protection

| Route | Auth required | Rationale |
|-------|---------------|-----------|
| `GET /` (directory) | Yes — password cookie | Owner-only browsing; enumerable list of all files |
| `GET /login`, `POST /api/login` | No | Login flow itself |
| `GET /api/health` | No | CLI uses for `init` validation |
| `GET /:pathname` (file proxy) | **No** | Shareable links; security via random suffix obscurity |

The directory is the owner's private dashboard. Individual files have unguessable URLs (~22-char random suffix from `addRandomSuffix: true`); anyone with a link can render the file in a browser, no password.

**Threat model accepted:**
- Anyone with a leaked file URL can fetch it forever (mitigation: `blob delete <pathname>`).
- The dashboard is enumerable to whoever has the password.

**Not in scope for v1:**
- Time-limited share links (separate `/share/:token` route — defer).
- Per-recipient invitation links.
- Vercel Access deployment-level protection.

## 5. CLI changes

### 5.1 Config schema

`~/.config/blob-cli/config.json`:

```jsonc
{
  "token": "blob_rw_…",
  "viewerUrl": "https://blob-viewer-xyz.vercel.app"
}
```

`viewerUrl` has no trailing slash. Both fields are required for `upload`, `list`, `get`. `delete` only needs the token.

### 5.2 `blob init`

Captures both. Flow:

1. Env-var early-exit and overwrite-confirm gates unchanged.
2. Prompt: "BLOB_READ_WRITE_TOKEN (or Enter to open Vercel)".
3. Prompt: "Viewer URL (or Enter to see deploy instructions)".
   - On Enter, print: deploy button URL + the three env vars to set, then re-prompt.
4. Validate token via SDK `list({ limit: 1, token })` (existing `validateToken`).
5. Validate viewer via `GET <viewerUrl>/api/health` — must return 200 and JSON `{ ok: true }`. On failure: re-prompt up to 3× total.
6. Save config 0600.

### 5.3 `blob upload`

```
put(name, body, { access: "private", addRandomSuffix: true, contentType, token })
  → blob.pathname
print: <viewerUrl>/<blob.pathname>
```

The viewer URL is composed client-side. The actual blob URL is *not* printed (it's not directly accessible anyway).

### 5.4 `blob list`

Same SDK call. Output rows now show `<viewerUrl>/<pathname>` instead of the raw blob URL. Same tab-separated columns: `<uploadedAt>\t<size>\t<viewer-url>`. JSON output keys unchanged (`url` field is the viewer URL; `pathname` field is the bare pathname).

### 5.5 `blob get`

Replaces direct-fetch path:

- If input matches `<viewerUrl>/<pathname>`: extract pathname.
- Else if input is bare pathname: use as-is.
- Else if input is an absolute http(s) URL not matching the viewer: error (`raw blob URLs are not directly fetchable in private mode`).
- Then: `await get(pathname, { access: "private", token })`. Stream `result.stream` to stdout or `--out`.

### 5.6 `blob delete`

Unchanged. SDK `del(urlOrPathname, { token })` accepts pathnames; works for private and public.

### 5.7 SDK upgrade

Bump `@vercel/blob` from `^0.27.0` to `^2.3.3`. Breaking changes to address:

- `addRandomSuffix` default flips from `true` (0.27) to `false` (2.3). We pass `true` explicitly already, so no behavior change — but tests asserting the default may need touchup.
- `BlobAccessType` is now `'public' | 'private'`; `put` no longer rejects non-public.
- New options on `put`: `allowOverwrite`, `ifMatch`, `maximumSizeInBytes`. Not used.
- New `get()` function (used by `blob get` and the viewer).
- Errors: `BlobAccessError` still exists; `BlobPreconditionFailedError` is new (not relevant unless using `ifMatch`).

Test mock signatures may need updating to match the new types.

## 6. Viewer

### 6.1 Layout

```
viewer/
├── package.json
├── next.config.mjs
├── tsconfig.json
├── README.md                     (Deploy-to-Vercel button + setup)
├── .env.example
├── app/
│   ├── layout.tsx
│   ├── globals.css               (minimal monospace stylesheet)
│   ├── page.tsx                  (server component: dashboard)
│   ├── login/page.tsx            (form)
│   ├── api/
│   │   ├── login/route.ts        (POST: verify password, set cookie)
│   │   └── health/route.ts       (GET: 200 OK)
│   └── [...pathname]/route.ts    (GET: stream blob inline)
└── lib/
    ├── session.ts                (HMAC sign/verify)
    └── env.ts                    (typed env-var access)
```

### 6.2 Required env vars

| Var | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | SDK auth for `list()`, `get()`, etc. |
| `VIEWER_PASSWORD` | Plaintext password gate for `/`. Constant-time compared on login. |
| `VIEWER_SESSION_SECRET` | 32-byte random base64. HMAC key for the session cookie. |

All three required. Viewer hard-fails on boot if any is missing.

### 6.3 Auth mechanics

- **Login form** (`/login/page.tsx`): single password input, posts to `/api/login`.
- **Login handler** (`/api/login/route.ts`):
  - Constant-time compare against `VIEWER_PASSWORD`.
  - On match: `Set-Cookie: viewer_session=<value>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` (7 days).
  - Cookie value: `base64url(JSON.stringify({ exp }))` + `.` + `base64url(HMAC-SHA256(payload, VIEWER_SESSION_SECRET))`.
  - Redirect to `/`.
- **Dashboard** (`app/page.tsx`, server component):
  - Reads cookie, verifies HMAC, checks `exp > now`.
  - On invalid/missing: redirect to `/login`.
  - On valid: SDK `list({ token })` → render HTML table.
- **File route** (`app/[...pathname]/route.ts`): no auth check.
- **Health route** (`app/api/health/route.ts`): no auth check; returns `{ ok: true, version }`.

### 6.4 File-proxy logic

```typescript
const result = await get(pathname, {
  access: "private",
  token: process.env.BLOB_READ_WRITE_TOKEN!,
});
if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
const contentType = result.headers.get("content-type") ?? "application/octet-stream";
return new Response(result.stream, {
  headers: {
    "content-type": contentType,
    "content-disposition": `inline; filename="${basename(pathname)}"`,
    "cache-control": "private, max-age=300",
  },
});
```

`GetBlobResult` exposes the upstream fetch's `Headers` object directly (not `blob.contentType`). The override of `content-disposition` is the entire reason the viewer exists — without it, Vercel's CDN returns `attachment` and browsers download.

### 6.5 Dashboard UI

- HTML `<table>` with columns: pathname (link), size (human-readable), uploaded (relative + ISO on hover).
- No client JS in v1. Pure server-rendered HTML + plain CSS.
- Sticky header. Monospace font. Subtle zebra rows. No framework.
- Empty state: "No files yet. Run `blob upload <file>` from the CLI."
- Pagination/search deferred. SDK `list()` returns up to 1000 by default; larger stores will be addressed when there's a real complaint.

### 6.6 Deploy button

`README.md` includes:

```
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bubuding0809/blob-cli&root-directory=viewer&env=BLOB_READ_WRITE_TOKEN,VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Token+from+your+Blob+store,+a+password+for+the+dashboard,+and+a+random+32-byte+secret)
```

Vercel handles the rest: clones the subdir, prompts for the three envs, deploys, returns a URL. User pastes the URL into `blob init`.

## 7. Repo layout — flat siblings, not Turbo

```
blob-cli/
├── package.json              (CLI, unchanged shape)
├── src/, test/, dist/        (CLI)
├── tsconfig.json             (CLI)
├── README.md                 (CLI usage + link to viewer/README)
├── viewer/                   (new — fully independent)
│   ├── package.json
│   ├── app/, lib/
│   ├── README.md             (Deploy-to-Vercel button)
│   └── tsconfig.json
└── docs/superpowers/         (specs + plans)
```

No workspaces, no Turbo, no shared `tsconfig.base.json`. Each project builds and deploys independently. Revisited if a real shared package emerges.

## 8. Testing

### 8.1 CLI

Existing TDD pattern (Red-Green-Blue, injectable deps) preserved. Updated for SDK 2.3.3 and the new viewer-URL handling:

- `config.test.ts` — add round-trip for `viewerUrl` field; null/missing handling.
- `init.test.ts` — add second prompt for viewer URL; mock `validateViewer` (HEALTH endpoint check); negative case (viewer returns 500 → re-prompt up to 3×).
- `init-validate.test.ts` — `validateViewer(url, deps)` unit tests: 200/JSON-ok → true, 200/wrong-shape → false, non-200 → false, network error → throw.
- `upload.test.ts` — assert `access: "private"` in put options; assert printed URL is `<viewerUrl>/<pathname>`.
- `list.test.ts` — assert printed rows use viewer URL.
- `get.test.ts` — three input modes (viewer URL, bare pathname, foreign URL → error); SDK `get()` mocked.
- `delete.test.ts` — unchanged.

Mock signatures updated for SDK 2.3.3 types where they currently mismatch (the `as any` casts already in place may need adjustment).

### 8.2 Viewer

Two tiers:

**Unit (Bun test):**
- `lib/session.test.ts` — sign/verify round-trip; tampered cookie rejected; expired cookie rejected; missing secret throws.
- `lib/env.test.ts` — missing env throws on access; values returned correctly when set.

**Route handler (Bun test, calling handlers directly with mock `Request`):**
- `api/health` — returns 200 JSON.
- `api/login` — wrong password → 401; right password → cookie set + redirect; missing password → 400.
- `[...pathname]` — `get()` returns null → 404; `get()` returns 200 → response has `content-disposition: inline`.
- `page.tsx` (dashboard) — no cookie → redirect to `/login`; valid cookie → calls `list()` and renders.

**Integration (gated, manual):** A short script that deploys the viewer to a preview URL, runs the CLI against it, asserts upload-then-view-in-browser actually renders inline. Out of scope for v1's CI; documented as a manual smoke test.

## 9. Migration / breaking changes

- Existing users (anyone who installed v0.1.0) lose the direct-blob-URL workflow on upgrade. Their saved tokens still validate; their `viewerUrl` will be missing on first run; `blob upload` errors with "run `blob init` to set viewer URL".
- Existing public Blob stores keep working *as data*, but uploads under v0.2.0 use `access: "private"`. Mixed-mode stores aren't supported (the SDK rejects mixing within one store).
- Recommend bumping the CLI to `0.2.0` to signal the breaking change.

## 10. Out of scope (do not implement)

- Time-limited share links / per-recipient signed URLs.
- Browser-side upload, rename, delete from the dashboard.
- Pagination, search, or folder hierarchy in the dashboard.
- Auto-deployment of the viewer from the CLI (the CLI shells out to `vercel deploy`).
- Hosted/shared viewer (multi-tenant SaaS).
- Custom domain configuration helper.
- Multi-store support (one CLI install, many tokens).

If any of these surface as pressure during implementation, stop and re-spec.
