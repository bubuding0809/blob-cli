# blob-cli viewer pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot blob-cli so HTML reports actually render in browsers, by routing reads through a small user-deployed Next.js viewer that proxies private-blob content with `Content-Disposition: inline`. CLI continues to be the only write path; the viewer doubles as a private file dashboard.

**Architecture:** Two flat siblings in one repo. CLI bumps to `0.2.0` and uses `@vercel/blob ^2.3.3` with `access: "private"`; it stores `{ token, viewerUrl }` in `~/.config/blob-cli/config.json`. The viewer is a small Next.js app the user deploys once via a "Deploy to Vercel" button, with three env vars (blob token, dashboard password, session secret). Dashboard `/` is password-gated; `/<pathname>` proxies the blob inline; `/api/health` is the CLI's validation endpoint.

**Tech Stack:** TypeScript, Bun for dev/test (CLI), Next.js 14 App Router (viewer, deployed on Vercel), `@vercel/blob ^2.3.3`, `commander`, `mime-types`. Pure runtime-stdlib HMAC for session cookies (no `iron-session` etc.). Bun test for both CLI and viewer.

**Methodology:** Red-Green-Blue TDD throughout. Each behavior: write failing test, run it, confirm it fails for the *right* reason; write minimum code to pass; refactor while green; commit each cycle.

---

## Task 1: Bump `@vercel/blob` to `^2.3.3`

**Why first:** every other CLI task depends on the new SDK surface (`access: "private"`, the `get()` function, etc.). Existing tests already use `as any` casts on mock function signatures, so they should keep compiling under the new types.

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (auto)

- [ ] **Step 1.1: Update the dependency version**

In `package.json`, change `"@vercel/blob": "^0.27.0"` to `"@vercel/blob": "^2.3.3"`.

- [ ] **Step 1.2: Install**

Run: `bun install`
Expected: `+ @vercel/blob@2.3.x` in output, no errors, lockfile updated.

- [ ] **Step 1.3: Run the existing test suite**

Run: `bun test`
Expected: 41 pass, 6 skip (integration tests). If any test fails, do NOT change the production code in this task — only adjust `as any` casts in test files to fit the new SDK types. The intent of Task 1 is "no behavior change".

If a test fails due to a real type/runtime mismatch (not a cast), STOP and report — that means a deeper change is needed and should be its own task.

- [ ] **Step 1.4: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. If any errors appear, fix them with minimal `as any` touch-ups in test files.

- [ ] **Step 1.5: Commit**

```bash
git add package.json bun.lock test/
git commit -m "Bump @vercel/blob from 0.27.0 to 2.3.3"
```

---

## Task 2: Add `viewerUrl` to the Config schema

**Files:**
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

### Step 2.1: Red — extend tests

- [ ] In `test/config.test.ts`, locate the `describe("readConfig", ...)` and `describe("writeConfig", ...)` blocks. Add the following tests at the end of `describe("readConfig", ...)`:

```typescript
test("returns config with viewerUrl when present", () => {
  mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
  writeFileSync(
    configPath(),
    JSON.stringify({ token: "blob_rw_abc", viewerUrl: "https://v.example.com" }),
  );
  expect(readConfig()).toEqual({
    token: "blob_rw_abc",
    viewerUrl: "https://v.example.com",
  });
});

test("returns config with viewerUrl undefined when missing", () => {
  mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
  writeFileSync(configPath(), JSON.stringify({ token: "blob_rw_abc" }));
  expect(readConfig()).toEqual({ token: "blob_rw_abc" });
});
```

And at the end of `describe("writeConfig", ...)`, replace the existing `round-trips with readConfig` test with:

```typescript
test("round-trips token only with readConfig", () => {
  writeConfig({ token: "blob_rw_round" });
  expect(readConfig()).toEqual({ token: "blob_rw_round" });
});

test("round-trips token + viewerUrl with readConfig", () => {
  writeConfig({ token: "blob_rw_round", viewerUrl: "https://v.example.com" });
  expect(readConfig()).toEqual({
    token: "blob_rw_round",
    viewerUrl: "https://v.example.com",
  });
});
```

Also update the existing `creates directory if missing` and `writes file with mode 0600` tests to call `writeConfig({ token: "blob_rw_xyz" })` (object) instead of `writeConfig("blob_rw_xyz")` (string). The signature change is part of this task.

### Step 2.2: Red — run

- [ ] Run: `bun test test/config.test.ts`
Expected: tests fail because `writeConfig` currently takes a string and `Config` interface lacks `viewerUrl`.

### Step 2.3: Green — extend `src/config.ts`

- [ ] Replace the contents of `src/config.ts` with:

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  token: string;
  viewerUrl?: string;
}

export function configPath(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".config", "blob-cli", "config.json");
}

export function readConfig(): Config | null {
  const p = configPath();
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (typeof data?.token !== "string") return null;
    const out: Config = { token: data.token };
    if (typeof data.viewerUrl === "string") out.viewerUrl = data.viewerUrl;
    return out;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

export function resolveToken(): string {
  const fromEnv = process.env.BLOB_READ_WRITE_TOKEN;
  if (fromEnv) return fromEnv;
  const fromFile = readConfig();
  if (fromFile) return fromFile.token;
  throw new Error(
    "No Vercel Blob token found. Run `blob init` or set BLOB_READ_WRITE_TOKEN.",
  );
}

export function resolveViewerUrl(): string {
  const fromFile = readConfig();
  if (fromFile?.viewerUrl) return fromFile.viewerUrl;
  throw new Error("No viewer URL configured. Run `blob init`.");
}
```

### Step 2.4: Green — also fix `init.ts`'s use of `writeConfig`

- [ ] In `src/commands/init.ts`, change the line:
```typescript
writeConfig(token);
```
to:
```typescript
writeConfig({ token });
```
(Task 4 will further extend this to include `viewerUrl`. For now keep parity with the new signature.)

### Step 2.5: Green — run

- [ ] Run: `bun test`
Expected: all tests pass (41 unit + new ones in `config.test.ts`).

### Step 2.6: Commit

- [ ] ```bash
git add src/config.ts src/commands/init.ts test/config.test.ts
git commit -m "Extend Config schema with optional viewerUrl"
```

---

## Task 3: Add `validateViewer` helper in `init.ts`

**Behavior:**
- `validateViewer(url, deps?)` calls `GET <url>/api/health` (deps.fetch injectable).
- Resolves `true` on 200 + JSON `{ ok: true }`.
- Resolves `false` on non-200, JSON parse error, or `ok !== true`.
- Throws on network/abort errors.

**Files:**
- Modify: `src/commands/init.ts`
- Create: `test/validate-viewer.test.ts`

### Step 3.1: Red — write tests

- [ ] Create `test/validate-viewer.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { validateViewer } from "../src/commands/init.ts";

describe("validateViewer", () => {
  test("returns true when /api/health responds 200 with { ok: true }", async () => {
    const fakeFetch = async (url: string) => {
      expect(url).toBe("https://v.example.com/api/health");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(true);
  });

  test("returns false on non-200", async () => {
    const fakeFetch = async () => new Response("nope", { status: 500 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("returns false on 200 with malformed JSON", async () => {
    const fakeFetch = async () => new Response("{not json", { status: 200 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("returns false when ok !== true", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ ok: false }), { status: 200 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("strips trailing slash before composing URL", async () => {
    let captured = "";
    const fakeFetch = async (url: string) => {
      captured = url;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await validateViewer("https://v.example.com/", { fetch: fakeFetch as any });
    expect(captured).toBe("https://v.example.com/api/health");
  });

  test("rethrows network errors", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      validateViewer("https://v.example.com", { fetch: fakeFetch as any }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
```

### Step 3.2: Red — run

- [ ] Run: `bun test test/validate-viewer.test.ts`
Expected: fails with "validateViewer is not exported".

### Step 3.3: Green — extend `src/commands/init.ts`

- [ ] Add the following exports near the top of `src/commands/init.ts` (alongside the existing `validateToken` and its `ValidateDeps`):

```typescript
export interface ValidateViewerDeps {
  fetch?: typeof fetch;
}

export async function validateViewer(
  url: string,
  deps: ValidateViewerDeps = {},
): Promise<boolean> {
  const doFetch = deps.fetch ?? fetch;
  const base = url.replace(/\/+$/, "");
  const res = await doFetch(`${base}/api/health`);
  if (!res.ok) return false;
  try {
    const data = (await res.json()) as { ok?: unknown };
    return data?.ok === true;
  } catch {
    return false;
  }
}
```

### Step 3.4: Green — run

- [ ] Run: `bun test test/validate-viewer.test.ts`
Expected: 6 pass.

### Step 3.5: Commit

- [ ] ```bash
git add src/commands/init.ts test/validate-viewer.test.ts
git commit -m "Add validateViewer helper that pings /api/health"
```

---

## Task 4: Update `runInit` to capture & validate viewer URL

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `test/init.test.ts`

### Step 4.1: Red — extend tests

- [ ] In `test/init.test.ts`, the existing tests pass `validate` and need a new `validateViewer` dep. Update the file by replacing **all** existing `runInit(...)` calls' deps objects to include `validateViewer`. For each test, add the line `validateViewer: async () => true,` next to `validate:`. For tests that exercise the viewer-prompt-retry behavior, override `validateViewer` accordingly.

- [ ] Add these new tests inside the `describe("runInit", ...)` block:

```typescript
test("prompts for viewer URL after token, saves both", async () => {
  await runInit(
    { force: false },
    {
      prompt: async (q: string) => {
        if (q.includes("Token")) return "blob_rw_ok";
        if (/Viewer URL|viewer url/i.test(q)) return "https://v.example.com";
        return "";
      },
      validate: async () => true,
      validateViewer: async () => true,
      openBrowser: async () => {},
      log: () => {},
    },
  );
  const cfg = JSON.parse(
    readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"),
  );
  expect(cfg.token).toBe("blob_rw_ok");
  expect(cfg.viewerUrl).toBe("https://v.example.com");
});

test("retries viewer URL up to 3 times then throws", async () => {
  let viewerCalls = 0;
  await expect(
    runInit(
      { force: false },
      {
        prompt: async (q: string) => {
          if (q.includes("Token")) return "blob_rw_ok";
          return "https://wrong.example.com";
        },
        validate: async () => true,
        validateViewer: async () => {
          viewerCalls++;
          return false;
        },
        openBrowser: async () => {},
        log: () => {},
      },
    ),
  ).rejects.toThrow(/3 attempts/);
  expect(viewerCalls).toBe(3);
});
```

### Step 4.2: Red — run

- [ ] Run: `bun test test/init.test.ts`
Expected: existing tests fail (missing `validateViewer` in deps) AND new tests fail (no viewer prompt yet).

### Step 4.3: Green — update `runInit`

- [ ] In `src/commands/init.ts`, replace **everything from the `InitDeps` interface through the end of `runInit`** (this includes the existing `VERCEL_BLOB_URL` and `MAX_ATTEMPTS` constants) with the code below. Leave the imports, `InitOpts`, `ValidateDeps`, `ValidateViewerDeps`, `validateToken`, and `validateViewer` definitions above untouched. After the replacement there must be exactly one definition of `VERCEL_BLOB_URL` and `MAX_ATTEMPTS` at module scope.

```typescript
export interface InitDeps {
  prompt?: PromptFn;
  validate?: (token: string) => Promise<boolean>;
  validateViewer?: (url: string) => Promise<boolean>;
  openBrowser?: (url: string) => Promise<void>;
  log?: (msg: string) => void;
}

const VERCEL_BLOB_URL = "https://vercel.com/dashboard/stores";
const MAX_ATTEMPTS = 3;

export async function runInit(opts: InitOpts, deps: InitDeps = {}): Promise<void> {
  const ask = deps.prompt ?? defaultPrompt;
  const validate = deps.validate ?? ((t: string) => validateToken(t));
  const validateV = deps.validateViewer ?? ((u: string) => validateViewer(u));
  const openBrowser = deps.openBrowser ?? ((u: string) => openUrl(u));
  const log = deps.log ?? ((m: string) => console.log(m));

  if (process.env.BLOB_READ_WRITE_TOKEN && !opts.force) {
    log(
      "BLOB_READ_WRITE_TOKEN is already set in your environment. Run with --force to save a token in config anyway.",
    );
    return;
  }

  if (readConfig() && !opts.force) {
    const confirm = await ask(
      `A token is already saved at ${configPath()}. Overwrite? [y/N]: `,
    );
    if (!/^y(es)?$/i.test(confirm)) {
      log("Aborted; existing config preserved.");
      return;
    }
  }

  log("blob-cli needs a Vercel Blob token. (See: https://vercel.com/docs/storage/vercel-blob)");
  log("  Already have a token?  Paste it below.");
  log("  Don't have one yet?    Press Enter and I'll open the page.");

  // Phase 1: token
  let token = "";
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

  // Phase 2: viewer URL
  log("");
  log("Now the viewer. blob-cli needs a small Next.js app you deploy once that proxies");
  log("blobs with proper inline-render headers and serves a private file dashboard.");
  log("Deploy the viewer (root-directory=viewer) at:");
  log("  https://github.com/bubuding0809/blob-cli#viewer");

  let viewerUrl = "";
  attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    const candidate = (await ask("Viewer URL (e.g. https://blob-viewer-xxx.vercel.app): ")).replace(
      /\/+$/,
      "",
    );
    if (!candidate) {
      attempts++;
      log("Empty input — paste the deployment URL.");
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

  writeConfig({ token, viewerUrl });
  log(`✓ saved to ${configPath()} (chmod 0600)`);
  log("You're set. Try:  blob upload README.md");
}
```

Also remove the old `runInit` body and `MAX_ATTEMPTS`/`VERCEL_BLOB_URL` constants if duplicated (they're now redefined inside this block — confirm there's only one of each at module scope).

Add `validateViewer` to the imports list at the top of `init.ts` (it's defined in the same file from Task 3, so no import needed — but ensure the function is declared *before* `runInit` references it).

### Step 4.4: Green — also drop `json` from `InitOpts`

- [ ] Verify `InitOpts` is `{ force: boolean }` only (this was already done in v0.1.0 work). If `json` is still there, remove it.

### Step 4.5: Green — run

- [ ] Run: `bun test`
Expected: all tests pass — existing 41 plus the new init/config/viewer-validate tests (~50 total).

### Step 4.6: Commit

- [ ] ```bash
git add src/commands/init.ts test/init.test.ts
git commit -m "Init: prompt and validate viewer URL after token"
```

---

## Task 5: `blob upload` — private access + viewer-URL output

**Files:**
- Modify: `src/commands/upload.ts`
- Modify: `test/upload.test.ts`

### Step 5.1: Red — update tests

- [ ] Replace `test/upload.test.ts` entirely with:

```typescript
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runUpload } from "../src/commands/upload.ts";

describe("runUpload", () => {
  test("calls put with private access, random suffix, inferred content type, and prints viewer URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "report.html");
    writeFileSync(file, "<html>hi</html>");

    let captured: any = null;
    const fakePut = (async (name: string, body: any, options: any) => {
      captured = { name, body: body.toString(), options };
      return {
        url: "https://store.public.blob.vercel-storage.com/report-x.html",
        pathname: "report-x.html",
      };
    }) as any;

    let printed = "";
    const fakePrintResult = (result: any, _opts: any) => {
      printed = result.text;
    };

    await runUpload(
      { path: file },
      {
        token: "blob_rw_test",
        viewerUrl: "https://v.example.com",
        put: fakePut,
        printResult: fakePrintResult,
      },
    );

    expect(captured.name).toBe("report.html");
    expect(captured.body).toBe("<html>hi</html>");
    expect(captured.options.access).toBe("private");
    expect(captured.options.addRandomSuffix).toBe(true);
    expect(captured.options.contentType).toBe("text/html");
    expect(captured.options.token).toBe("blob_rw_test");
    expect(printed).toBe("https://v.example.com/report-x.html");

    rmSync(dir, { recursive: true, force: true });
  });

  test("--name overrides the basename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "anything.txt");
    writeFileSync(file, "hello");

    let captured = "";
    await runUpload(
      { path: file, name: "renamed.txt" },
      {
        token: "t",
        viewerUrl: "https://v",
        put: (async (name: string) => {
          captured = name;
          return { url: "https://x", pathname: "renamed-x.txt" };
        }) as any,
        printResult: () => {},
      },
    );
    expect(captured).toBe("renamed.txt");
    rmSync(dir, { recursive: true, force: true });
  });

  test("falls back to application/octet-stream for unknown extensions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "data.weirdext");
    writeFileSync(file, "x");

    let capturedType: string | undefined;
    await runUpload(
      { path: file },
      {
        token: "t",
        viewerUrl: "https://v",
        put: (async (_n: string, _b: any, opts: any) => {
          capturedType = opts.contentType;
          return { url: "https://x", pathname: "data-x.weirdext" };
        }) as any,
        printResult: () => {},
      },
    );
    expect(capturedType).toBe("application/octet-stream");
    rmSync(dir, { recursive: true, force: true });
  });

  test("printed viewer URL strips trailing slash on viewerUrl", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "x.html");
    writeFileSync(file, "y");

    let printed = "";
    await runUpload(
      { path: file },
      {
        token: "t",
        viewerUrl: "https://v.example.com/",
        put: (async () => ({ url: "https://blob/x-x.html", pathname: "x-x.html" })) as any,
        printResult: (r: any) => {
          printed = r.text;
        },
      },
    );
    expect(printed).toBe("https://v.example.com/x-x.html");
    rmSync(dir, { recursive: true, force: true });
  });
});
```

### Step 5.2: Red — run

- [ ] Run: `bun test test/upload.test.ts`
Expected: tests fail because the current implementation passes `access: "public"` and prints `blob.url`.

### Step 5.3: Green — replace `src/commands/upload.ts`

- [ ] Replace the file contents with:

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { lookup as lookupMime } from "mime-types";
import { put as sdkPut, type PutCommandOptions, type PutBlobResult } from "@vercel/blob";

import { resolveToken, resolveViewerUrl } from "../config.ts";
import { printResult as defaultPrintResult } from "../output.ts";

export interface UploadOpts {
  path: string;
  name?: string;
}

export interface UploadDeps {
  token?: string;
  viewerUrl?: string;
  put?: (
    name: string,
    body: Buffer | string,
    options: PutCommandOptions,
  ) => Promise<PutBlobResult>;
  printResult?: typeof defaultPrintResult;
}

export async function runUpload(opts: UploadOpts, deps: UploadDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const viewerUrl = (deps.viewerUrl ?? resolveViewerUrl()).replace(/\/+$/, "");
  const put = deps.put ?? sdkPut;
  const printResult = deps.printResult ?? defaultPrintResult;

  const body = await readFile(opts.path);
  const name = opts.name ?? basename(opts.path);
  const contentType = lookupMime(name) || "application/octet-stream";

  const blob = await put(name, body, {
    access: "private",
    addRandomSuffix: true,
    contentType,
    token,
  });

  const viewUrl = `${viewerUrl}/${blob.pathname}`;
  printResult({ text: viewUrl, json: { url: viewUrl, pathname: blob.pathname } }, { json: false });
}
```

Also update `src/cli.ts`'s upload action to drop `json` (since we removed `--json` per the v0.1 cleanup; if it's still there, leave it, the `runUpload` opts no longer accept it):

- [ ] In `src/cli.ts`, ensure the upload action passes only `{ path, name: opts.name }` to `runUpload`. Remove any `json:` field.

### Step 5.4: Green — run

- [ ] Run: `bun test`
Expected: all tests pass.

### Step 5.5: Commit

- [ ] ```bash
git add src/commands/upload.ts src/cli.ts test/upload.test.ts
git commit -m "Upload: switch to access=private and emit viewer URL"
```

---

## Task 6: `blob list` — emit viewer URLs

**Files:**
- Modify: `src/commands/list.ts`
- Modify: `test/list.test.ts`

### Step 6.1: Red — update tests

- [ ] Replace `test/list.test.ts` with:

```typescript
import { describe, test, expect } from "bun:test";
import { runList } from "../src/commands/list.ts";

const fakeBlobs = [
  {
    url: "https://store/a.html",
    pathname: "a.html",
    size: 100,
    uploadedAt: new Date("2026-04-28T10:00:00Z"),
  },
  {
    url: "https://store/b.html",
    pathname: "b.html",
    size: 200,
    uploadedAt: new Date("2026-04-28T11:00:00Z"),
  },
];

describe("runList", () => {
  test("passes prefix and limit to SDK", async () => {
    let captured: any = null;
    await runList(
      { prefix: "reports/", limit: 50, json: false },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        list: async (params) => {
          captured = params;
          return { blobs: [], hasMore: false, cursor: undefined } as any;
        },
        printResult: () => {},
      },
    );
    expect(captured.prefix).toBe("reports/");
    expect(captured.limit).toBe(50);
    expect(captured.token).toBe("t");
  });

  test("human output uses viewer URL, tab-separated", async () => {
    let printed = "";
    await runList(
      { limit: 100, json: false },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        list: async () => ({ blobs: fakeBlobs, hasMore: false, cursor: undefined } as any),
        printResult: (r, _o) => {
          printed = r.text;
        },
      },
    );
    expect(printed).toBe(
      "2026-04-28T10:00:00.000Z\t100\thttps://v.example.com/a.html\n" +
        "2026-04-28T11:00:00.000Z\t200\thttps://v.example.com/b.html",
    );
  });

  test("json output exposes viewer URL on each blob", async () => {
    let printedJson: any = null;
    await runList(
      { limit: 100, json: true },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        list: async () => ({ blobs: fakeBlobs, hasMore: false, cursor: undefined } as any),
        printResult: (r, opts) => {
          if (opts.json) printedJson = r.json;
        },
      },
    );
    expect(printedJson.blobs).toHaveLength(2);
    expect(printedJson.blobs[0].url).toBe("https://v.example.com/a.html");
    expect(printedJson.blobs[0].pathname).toBe("a.html");
  });

  test("strips trailing slash on viewerUrl", async () => {
    let printed = "";
    await runList(
      { limit: 100, json: false },
      {
        token: "t",
        viewerUrl: "https://v.example.com/",
        list: async () => ({ blobs: [fakeBlobs[0]], hasMore: false, cursor: undefined } as any),
        printResult: (r) => {
          printed = r.text;
        },
      },
    );
    expect(printed).toContain("https://v.example.com/a.html");
    expect(printed).not.toContain("//a.html");
  });
});
```

### Step 6.2: Red — run

- [ ] Run: `bun test test/list.test.ts`
Expected: tests fail (current code uses `b.url`, not viewer URL).

### Step 6.3: Green — replace `src/commands/list.ts`

- [ ] Replace contents with:

```typescript
import { list as sdkList, type ListCommandOptions, type ListBlobResult } from "@vercel/blob";

import { resolveToken, resolveViewerUrl } from "../config.ts";
import { printResult as defaultPrintResult } from "../output.ts";

export interface ListOpts {
  prefix?: string;
  limit: number;
  json: boolean;
}

export interface ListDeps {
  token?: string;
  viewerUrl?: string;
  list?: (options: ListCommandOptions) => Promise<ListBlobResult>;
  printResult?: typeof defaultPrintResult;
}

export async function runList(opts: ListOpts, deps: ListDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const viewerUrl = (deps.viewerUrl ?? resolveViewerUrl()).replace(/\/+$/, "");
  const list = deps.list ?? sdkList;
  const printResult = deps.printResult ?? defaultPrintResult;

  const result = await list({
    prefix: opts.prefix,
    limit: opts.limit,
    token,
  });

  const text = result.blobs
    .map((b) => `${b.uploadedAt.toISOString()}\t${b.size}\t${viewerUrl}/${b.pathname}`)
    .join("\n");

  printResult(
    {
      text,
      json: {
        blobs: result.blobs.map((b) => ({
          url: `${viewerUrl}/${b.pathname}`,
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt.toISOString(),
        })),
      },
    },
    { json: opts.json },
  );
}
```

### Step 6.4: Green — run

- [ ] Run: `bun test`
Expected: all pass.

### Step 6.5: Commit

- [ ] ```bash
git add src/commands/list.ts test/list.test.ts
git commit -m "List: emit viewer URLs in human and JSON output"
```

---

## Task 7: `blob get` — SDK `get()` + viewer-URL parsing

**Files:**
- Modify: `src/commands/get.ts`
- Modify: `test/get.test.ts`

### Step 7.1: Red — update tests

- [ ] Replace `test/get.test.ts` entirely with:

```typescript
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGet } from "../src/commands/get.ts";

const okGet = (body: string) =>
  ((async () => ({
    statusCode: 200,
    stream: new Response(body).body!,
    headers: new Headers({ "content-type": "text/html" }),
    blob: { pathname: "x.html" },
  })) as any);

describe("runGet", () => {
  test("extracts pathname from a viewer URL and calls SDK get with private access", async () => {
    let captured: any = null;
    let written = "";
    await runGet(
      { urlOrPath: "https://v.example.com/report-x.html" },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: (async (pathname: string, options: any) => {
          captured = { pathname, options };
          return {
            statusCode: 200,
            stream: new Response("hello").body!,
            headers: new Headers({ "content-type": "text/html" }),
            blob: { pathname: "report-x.html" },
          };
        }) as any,
        writeStdout: (chunk: Buffer) => {
          written += chunk.toString();
        },
      },
    );
    expect(captured.pathname).toBe("report-x.html");
    expect(captured.options.access).toBe("private");
    expect(captured.options.token).toBe("t");
    expect(written).toBe("hello");
  });

  test("treats bare pathname as pathname directly", async () => {
    let captured = "";
    await runGet(
      { urlOrPath: "report-x.html" },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: (async (pathname: string) => {
          captured = pathname;
          return {
            statusCode: 200,
            stream: new Response("body").body!,
            headers: new Headers(),
            blob: { pathname },
          };
        }) as any,
        writeStdout: () => {},
      },
    );
    expect(captured).toBe("report-x.html");
  });

  test("rejects an http(s) URL that doesn't match the viewer", async () => {
    await expect(
      runGet(
        { urlOrPath: "https://other.example.com/x.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: okGet("x"),
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/viewer URL|pathname/);
  });

  test("--out writes to file instead of stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "get-test-"));
    const out = join(dir, "out.html");
    let stdoutWritten = "";
    await runGet(
      { urlOrPath: "x.html", out },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: okGet("filebody"),
        writeStdout: (chunk: Buffer) => {
          stdoutWritten += chunk.toString();
        },
      },
    );
    expect(readFileSync(out, "utf8")).toBe("filebody");
    expect(stdoutWritten).toBe("");
    rmSync(dir, { recursive: true, force: true });
  });

  test("throws on null result (not found)", async () => {
    await expect(
      runGet(
        { urlOrPath: "missing.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: (async () => null) as any,
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/not found/i);
  });

  test("throws on 304 result", async () => {
    await expect(
      runGet(
        { urlOrPath: "x.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: (async () => ({ statusCode: 304, stream: null, headers: new Headers(), blob: null })) as any,
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/not found|304/i);
  });
});
```

### Step 7.2: Red — run

- [ ] Run: `bun test test/get.test.ts`
Expected: tests fail (current code uses head + fetch, not SDK get).

### Step 7.3: Green — replace `src/commands/get.ts`

- [ ] Replace contents with:

```typescript
import { writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { get as sdkGet, type GetBlobResult } from "@vercel/blob";

import { resolveToken, resolveViewerUrl } from "../config.ts";

export interface GetOpts {
  urlOrPath: string;
  out?: string;
}

export interface GetDeps {
  token?: string;
  viewerUrl?: string;
  get?: (
    pathname: string,
    options: { access: "private"; token: string },
  ) => Promise<GetBlobResult | null>;
  writeStdout?: (chunk: Buffer) => void;
}

export async function runGet(opts: GetOpts, deps: GetDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const viewerUrl = (deps.viewerUrl ?? resolveViewerUrl()).replace(/\/+$/, "");
  const doGet = deps.get ?? sdkGet;
  const writeStdout =
    deps.writeStdout ?? ((chunk: Buffer) => process.stdout.write(chunk));

  // Resolve to a bare pathname.
  let pathname: string;
  if (/^https?:\/\//i.test(opts.urlOrPath)) {
    if (!opts.urlOrPath.startsWith(`${viewerUrl}/`)) {
      throw new Error(
        `URL must be a pathname or start with the viewer URL (${viewerUrl}). Got: ${opts.urlOrPath}`,
      );
    }
    pathname = opts.urlOrPath.slice(viewerUrl.length + 1);
  } else {
    pathname = opts.urlOrPath;
  }

  const result = await doGet(pathname, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`not found: ${pathname}`);
  }

  // Convert WebReadableStream → Buffer
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  if (opts.out) {
    await writeFile(opts.out, buf);
  } else {
    writeStdout(buf);
  }
}
```

Also update `src/cli.ts`'s `get` command action to drop `json` if it's still being passed: action becomes `runGet({ urlOrPath, out: opts.out })`.

### Step 7.4: Green — run

- [ ] Run: `bun test`
Expected: all pass.

### Step 7.5: Commit

- [ ] ```bash
git add src/commands/get.ts src/cli.ts test/get.test.ts
git commit -m "Get: use SDK get() with access=private and viewer URL parsing"
```

---

## Task 8: Bump CLI version + smoke test

**Files:**
- Modify: `package.json`

- [ ] **Step 8.1: Bump version**

In `package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 8.2: Run full test suite**

Run: `bun test`
Expected: 41+ unit tests pass, integration tests skip.

- [ ] **Step 8.3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8.4: Build**

Run: `bun run build`
Expected: `dist/cli.js` produced, executable.

- [ ] **Step 8.5: Smoke test the binary**

Run: `node dist/cli.js --help`
Expected: usage banner with all 5 subcommands.

Run: `node dist/cli.js upload missing.txt 2>&1 || true`
Expected: error mentioning the missing token (or missing viewer URL, or missing file — all acceptable).

- [ ] **Step 8.6: Commit**

```bash
git add package.json
git commit -m "CLI: bump to 0.2.0 (breaking: viewer-routed reads)"
```

---

## Task 9: Viewer bootstrap

**Files (all under `viewer/`):**
- Create: `viewer/package.json`
- Create: `viewer/tsconfig.json`
- Create: `viewer/next.config.mjs`
- Create: `viewer/.env.example`
- Create: `viewer/.gitignore`
- Create: `viewer/app/layout.tsx`
- Create: `viewer/app/page.tsx` (placeholder, replaced in Task 14)

- [ ] **Step 9.1: Create `viewer/package.json`**

```json
{
  "name": "blob-cli-viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "bun test"
  },
  "dependencies": {
    "@vercel/blob": "^2.3.3",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 9.2: Create `viewer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 9.3: Create `viewer/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 9.4: Create `viewer/.env.example`**

```
BLOB_READ_WRITE_TOKEN=blob_rw_…
VIEWER_PASSWORD=changeme
VIEWER_SESSION_SECRET=base64-32-bytes
```

- [ ] **Step 9.5: Create `viewer/.gitignore`**

```
node_modules/
.next/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 9.6: Create placeholder `viewer/app/layout.tsx`**

```tsx
export const metadata = { title: "blob viewer" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9.7: Create placeholder `viewer/app/page.tsx`**

```tsx
export default function Page() {
  return <main>blob viewer (not yet implemented)</main>;
}
```

- [ ] **Step 9.8: Install**

```bash
cd viewer
bun install
```

Expected: dependencies installed (Next.js, React, @vercel/blob), no errors. Lockfile created.

- [ ] **Step 9.9: Verify Next builds**

```bash
cd viewer
bunx next build
```

Expected: `Compiled successfully`. Ignore the warnings about static export / dynamic routes that don't exist yet.

- [ ] **Step 9.10: Commit**

```bash
git add viewer/
git commit -m "Viewer: scaffold Next.js app with placeholder page"
```

---

## Task 10: Viewer env helpers (TDD)

**Files:**
- Create: `viewer/lib/env.ts`
- Create: `viewer/test/env.test.ts`

### Step 10.1: Red — write tests

- [ ] Create `viewer/test/env.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getBlobToken, getViewerPassword, getViewerSessionSecret } from "../lib/env.ts";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VIEWER_PASSWORD: process.env.VIEWER_PASSWORD,
    VIEWER_SESSION_SECRET: process.env.VIEWER_SESSION_SECRET,
  };
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VIEWER_PASSWORD;
  delete process.env.VIEWER_SESSION_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("env helpers", () => {
  test("getBlobToken throws when missing", () => {
    expect(() => getBlobToken()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  test("getBlobToken returns the value when set", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_x";
    expect(getBlobToken()).toBe("blob_rw_x");
  });

  test("getViewerPassword throws when missing", () => {
    expect(() => getViewerPassword()).toThrow(/VIEWER_PASSWORD/);
  });

  test("getViewerPassword returns the value when set", () => {
    process.env.VIEWER_PASSWORD = "hunter2";
    expect(getViewerPassword()).toBe("hunter2");
  });

  test("getViewerSessionSecret throws when missing", () => {
    expect(() => getViewerSessionSecret()).toThrow(/VIEWER_SESSION_SECRET/);
  });

  test("getViewerSessionSecret returns the value when set", () => {
    process.env.VIEWER_SESSION_SECRET = "abc123";
    expect(getViewerSessionSecret()).toBe("abc123");
  });
});
```

### Step 10.2: Red — run

- [ ] Run from `viewer/`: `bun test test/env.test.ts`
Expected: fails (module not found).

### Step 10.3: Green — implementation

- [ ] Create `viewer/lib/env.ts`:

```typescript
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

export function getBlobToken(): string {
  return required("BLOB_READ_WRITE_TOKEN");
}

export function getViewerPassword(): string {
  return required("VIEWER_PASSWORD");
}

export function getViewerSessionSecret(): string {
  return required("VIEWER_SESSION_SECRET");
}
```

### Step 10.4: Green — run

- [ ] Run from `viewer/`: `bun test test/env.test.ts`
Expected: 6 pass.

### Step 10.5: Commit

- [ ] ```bash
git add viewer/lib/env.ts viewer/test/env.test.ts
git commit -m "Viewer: typed env-var accessors with required-or-throw semantics"
```

---

## Task 11: Viewer session HMAC (TDD)

**Files:**
- Create: `viewer/lib/session.ts`
- Create: `viewer/test/session.test.ts`

### Step 11.1: Red — write tests

- [ ] Create `viewer/test/session.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { signSession, verifySession } from "../lib/session.ts";

const SECRET = "test-secret-32-bytes-base64-padding==";

describe("session", () => {
  test("sign + verify round-trip", () => {
    const token = signSession({ exp: 1234567890 }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ exp: 1234567890 });
  });

  test("verify returns null on tampered payload", () => {
    const token = signSession({ exp: 1234567890 }, SECRET);
    const [payload, sig] = token.split(".");
    const tampered = payload.replace(/.$/, "x") + "." + sig;
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  test("verify returns null on tampered signature", () => {
    const token = signSession({ exp: 1234567890 }, SECRET);
    const tampered = token.replace(/.$/, "x");
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  test("verify returns null on wrong secret", () => {
    const token = signSession({ exp: 1234567890 }, SECRET);
    expect(verifySession(token, "different-secret")).toBeNull();
  });

  test("verify returns null on missing token", () => {
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
  });

  test("verify returns null on malformed token", () => {
    expect(verifySession("no-dot-here", SECRET)).toBeNull();
    expect(verifySession("only.one.dot.too.many", SECRET)).toBeNull();
  });

  test("verify returns null when exp is in the past", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = signSession({ exp: past }, SECRET);
    expect(verifySession(token, SECRET)).toBeNull();
  });

  test("verify returns payload when exp is in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ exp: future });
  });
});
```

### Step 11.2: Red — run

- [ ] Run from `viewer/`: `bun test test/session.test.ts`
Expected: fails (module not found).

### Step 11.3: Green — implementation

- [ ] Create `viewer/lib/session.ts`:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  exp: number; // seconds since epoch
}

function b64urlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(str: string): Buffer {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function hmac(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function signSession(payload: SessionPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const encoded = b64urlEncode(Buffer.from(json, "utf8"));
  const sig = hmac(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = hmac(encoded, secret);
  // constant-time compare
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.exp !== "number") return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
```

### Step 11.4: Green — run

- [ ] Run from `viewer/`: `bun test test/session.test.ts`
Expected: 8 pass.

### Step 11.5: Commit

- [ ] ```bash
git add viewer/lib/session.ts viewer/test/session.test.ts
git commit -m "Viewer: HMAC-signed session tokens with exp check"
```

---

## Task 12: Viewer health endpoint (TDD)

**Files:**
- Create: `viewer/app/api/health/route.ts`
- Create: `viewer/test/health-route.test.ts`

### Step 12.1: Red — write tests

- [ ] Create `viewer/test/health-route.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { GET } from "../app/api/health/route.ts";

describe("GET /api/health", () => {
  test("returns 200 with { ok: true }", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("includes a version field", async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.version).toBe("string");
  });
});
```

### Step 12.2: Red — run

- [ ] Run from `viewer/`: `bun test test/health-route.test.ts`
Expected: fails (route module missing).

### Step 12.3: Green — implementation

- [ ] Create `viewer/app/api/health/route.ts`:

```typescript
export async function GET() {
  return new Response(JSON.stringify({ ok: true, version: "0.1.0" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
```

### Step 12.4: Green — run

- [ ] Run from `viewer/`: `bun test test/health-route.test.ts`
Expected: 2 pass.

### Step 12.5: Commit

- [ ] ```bash
git add viewer/app/api/health/route.ts viewer/test/health-route.test.ts
git commit -m "Viewer: /api/health endpoint for CLI init validation"
```

---

## Task 13: Viewer login flow (TDD)

**Files:**
- Create: `viewer/app/api/login/route.ts`
- Create: `viewer/app/login/page.tsx`
- Create: `viewer/test/login-route.test.ts`

### Step 13.1: Red — write tests

- [ ] Create `viewer/test/login-route.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { POST } from "../app/api/login/route.ts";

const ENV_VARS = {
  VIEWER_PASSWORD: "hunter2",
  VIEWER_SESSION_SECRET: "test-secret-32-bytes-base64-padding==",
};
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    VIEWER_PASSWORD: process.env.VIEWER_PASSWORD,
    VIEWER_SESSION_SECRET: process.env.VIEWER_SESSION_SECRET,
  };
  process.env.VIEWER_PASSWORD = ENV_VARS.VIEWER_PASSWORD;
  process.env.VIEWER_SESSION_SECRET = ENV_VARS.VIEWER_SESSION_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function makeRequest(body: URLSearchParams): Request {
  return new Request("https://v.example.com/api/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/login", () => {
  test("redirects to / on correct password and sets cookie", async () => {
    const res = await POST(makeRequest(new URLSearchParams({ password: "hunter2" })));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("viewer_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  test("returns 401 on wrong password", async () => {
    const res = await POST(makeRequest(new URLSearchParams({ password: "wrong" })));
    expect(res.status).toBe(401);
  });

  test("returns 400 when password field is missing", async () => {
    const res = await POST(makeRequest(new URLSearchParams({})));
    expect(res.status).toBe(400);
  });
});
```

### Step 13.2: Red — run

- [ ] Run from `viewer/`: `bun test test/login-route.test.ts`
Expected: fails (route module missing).

### Step 13.3: Green — implement route

- [ ] Create `viewer/app/api/login/route.ts`:

```typescript
import { timingSafeEqual } from "node:crypto";
import { signSession } from "@/lib/session.ts";
import { getViewerPassword, getViewerSessionSecret } from "@/lib/env.ts";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = form.get("password");
  if (typeof submitted !== "string") {
    return new Response("password required", { status: 400 });
  }
  const expected = getViewerPassword();
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("invalid", { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ exp }, getViewerSessionSecret());
  const cookie = `viewer_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": cookie },
  });
}
```

### Step 13.4: Green — login page

- [ ] Create `viewer/app/login/page.tsx`:

```tsx
export default function LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: "8rem auto", fontFamily: "ui-monospace, monospace" }}>
      <h1>blob viewer</h1>
      <form method="post" action="/api/login">
        <label>
          Password
          <input
            type="password"
            name="password"
            autoFocus
            required
            style={{ width: "100%", marginTop: 4, padding: 6 }}
          />
        </label>
        <button type="submit" style={{ marginTop: 12, padding: "6px 14px" }}>
          Sign in
        </button>
      </form>
    </main>
  );
}
```

### Step 13.5: Green — run

- [ ] Run from `viewer/`: `bun test test/login-route.test.ts`
Expected: 3 pass.

### Step 13.6: Commit

- [ ] ```bash
git add viewer/app/api/login/route.ts viewer/app/login/page.tsx viewer/test/login-route.test.ts
git commit -m "Viewer: login form + POST /api/login with HMAC session cookie"
```

---

## Task 14: Viewer file proxy (TDD)

**Files:**
- Create: `viewer/lib/serve-blob.ts` (testable proxy core)
- Create: `viewer/app/[...pathname]/route.ts` (thin Next handler)
- Create: `viewer/test/serve-blob.test.ts`

### Step 14.1: Red — write tests

- [ ] Create `viewer/test/serve-blob.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { serveBlob } from "../lib/serve-blob.ts";

const okGet = (body: string, contentType: string) =>
  ((async () => ({
    statusCode: 200,
    stream: new Response(body).body!,
    headers: new Headers({ "content-type": contentType }),
    blob: { pathname: "x" },
  })) as any);

describe("serveBlob", () => {
  test("returns 200 with inline content-disposition and original content-type", async () => {
    const res = await serveBlob("report.html", {
      token: "t",
      get: okGet("<h1>hi</h1>", "text/html"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="report.html"',
    );
    expect(await res.text()).toBe("<h1>hi</h1>");
  });

  test("falls back to application/octet-stream when content-type missing", async () => {
    const res = await serveBlob("anon", {
      token: "t",
      get: (async () => ({
        statusCode: 200,
        stream: new Response("x").body!,
        headers: new Headers(),
        blob: { pathname: "anon" },
      })) as any,
    });
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  test("uses last path segment for filename in content-disposition", async () => {
    const res = await serveBlob("dir/sub/report-x.html", {
      token: "t",
      get: okGet("x", "text/html"),
    });
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="report-x.html"',
    );
  });

  test("returns 404 when get returns null", async () => {
    const res = await serveBlob("missing", {
      token: "t",
      get: (async () => null) as any,
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 when get returns 304", async () => {
    const res = await serveBlob("x", {
      token: "t",
      get: (async () => ({
        statusCode: 304,
        stream: null,
        headers: new Headers(),
        blob: null,
      })) as any,
    });
    expect(res.status).toBe(404);
  });

  test("calls SDK with access=private and supplied token", async () => {
    let captured: any = null;
    await serveBlob("x", {
      token: "secret",
      get: (async (pathname: string, options: any) => {
        captured = { pathname, options };
        return {
          statusCode: 200,
          stream: new Response("x").body!,
          headers: new Headers({ "content-type": "text/plain" }),
          blob: { pathname },
        };
      }) as any,
    });
    expect(captured.pathname).toBe("x");
    expect(captured.options.access).toBe("private");
    expect(captured.options.token).toBe("secret");
  });
});
```

### Step 14.2: Red — run

- [ ] Run from `viewer/`: `bun test test/serve-blob.test.ts`
Expected: fails (module missing).

### Step 14.3: Green — implement core

- [ ] Create `viewer/lib/serve-blob.ts`:

```typescript
import { get as sdkGet, type GetBlobResult } from "@vercel/blob";

export interface ServeBlobDeps {
  token: string;
  get?: (
    pathname: string,
    options: { access: "private"; token: string },
  ) => Promise<GetBlobResult | null>;
}

export async function serveBlob(pathname: string, deps: ServeBlobDeps): Promise<Response> {
  const doGet = deps.get ?? sdkGet;
  const result = await doGet(pathname, { access: "private", token: deps.token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new Response("Not found", { status: 404 });
  }
  const contentType = result.headers.get("content-type") ?? "application/octet-stream";
  const filename = pathname.split("/").pop() ?? pathname;
  return new Response(result.stream, {
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
```

### Step 14.4: Green — Next route handler

- [ ] Create `viewer/app/[...pathname]/route.ts`:

```typescript
import { serveBlob } from "@/lib/serve-blob.ts";
import { getBlobToken } from "@/lib/env.ts";

export async function GET(
  _request: Request,
  { params }: { params: { pathname: string[] } },
) {
  const pathname = params.pathname.join("/");
  return serveBlob(pathname, { token: getBlobToken() });
}
```

### Step 14.5: Green — run

- [ ] Run from `viewer/`: `bun test test/serve-blob.test.ts`
Expected: 6 pass.

### Step 14.6: Commit

- [ ] ```bash
git add viewer/lib/serve-blob.ts viewer/app/[...pathname]/route.ts viewer/test/serve-blob.test.ts
git commit -m "Viewer: catch-all file proxy with inline content-disposition"
```

---

## Task 15: Viewer dashboard (TDD for the data layer; light-touch UI)

**Files:**
- Create: `viewer/lib/list-blobs.ts`
- Create: `viewer/lib/format.ts` (humanizeBytes)
- Create: `viewer/test/list-blobs.test.ts`
- Create: `viewer/test/format.test.ts`
- Modify: `viewer/app/page.tsx` (replace the placeholder)
- Create: `viewer/app/globals.css`
- Modify: `viewer/app/layout.tsx` (import globals)

### Step 15.1: Red — `list-blobs` tests

- [ ] Create `viewer/test/list-blobs.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { listBlobs } from "../lib/list-blobs.ts";

describe("listBlobs", () => {
  test("calls SDK list with token", async () => {
    let captured: any = null;
    await listBlobs({
      token: "secret",
      list: (async (params: any) => {
        captured = params;
        return { blobs: [], hasMore: false, cursor: undefined };
      }) as any,
    });
    expect(captured.token).toBe("secret");
  });

  test("returns blobs sorted by uploadedAt descending", async () => {
    const result = await listBlobs({
      token: "t",
      list: (async () => ({
        blobs: [
          { pathname: "a", size: 1, uploadedAt: new Date("2026-04-01") },
          { pathname: "b", size: 2, uploadedAt: new Date("2026-04-28") },
          { pathname: "c", size: 3, uploadedAt: new Date("2026-04-15") },
        ],
        hasMore: false,
        cursor: undefined,
      })) as any,
    });
    expect(result.map((b) => b.pathname)).toEqual(["b", "c", "a"]);
  });
});
```

### Step 15.2: Red — `format` tests

- [ ] Create `viewer/test/format.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { humanizeBytes } from "../lib/format.ts";

describe("humanizeBytes", () => {
  test("bytes", () => {
    expect(humanizeBytes(0)).toBe("0 B");
    expect(humanizeBytes(512)).toBe("512 B");
    expect(humanizeBytes(1023)).toBe("1023 B");
  });
  test("KB", () => {
    expect(humanizeBytes(1024)).toBe("1.0 KB");
    expect(humanizeBytes(1536)).toBe("1.5 KB");
  });
  test("MB", () => {
    expect(humanizeBytes(1024 * 1024)).toBe("1.0 MB");
    expect(humanizeBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  test("GB", () => {
    expect(humanizeBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});
```

### Step 15.3: Red — run

- [ ] Run from `viewer/`: `bun test test/list-blobs.test.ts test/format.test.ts`
Expected: fails (modules missing).

### Step 15.4: Green — `list-blobs.ts`

- [ ] Create `viewer/lib/list-blobs.ts`:

```typescript
import { list as sdkList, type ListCommandOptions } from "@vercel/blob";

export interface BlobRow {
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobsDeps {
  token: string;
  list?: (options: ListCommandOptions) => Promise<{
    blobs: BlobRow[];
    hasMore: boolean;
    cursor: string | undefined;
  }>;
}

export async function listBlobs(deps: ListBlobsDeps): Promise<BlobRow[]> {
  const list = deps.list ?? (sdkList as any);
  const result = await list({ token: deps.token, limit: 1000 });
  const sorted = [...result.blobs].sort(
    (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
  );
  return sorted;
}
```

### Step 15.5: Green — `format.ts`

- [ ] Create `viewer/lib/format.ts`:

```typescript
const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function humanizeBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  let v = n;
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${UNITS[u]}`;
}
```

### Step 15.6: Green — run

- [ ] Run from `viewer/`: `bun test test/list-blobs.test.ts test/format.test.ts`
Expected: tests pass.

### Step 15.7: Replace `viewer/app/page.tsx`

- [ ] Replace the placeholder with:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session.ts";
import { listBlobs } from "@/lib/list-blobs.ts";
import { humanizeBytes } from "@/lib/format.ts";
import { getBlobToken, getViewerSessionSecret } from "@/lib/env.ts";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = verifySession(
    cookies().get("viewer_session")?.value,
    getViewerSessionSecret(),
  );
  if (!session) redirect("/login");

  const blobs = await listBlobs({ token: getBlobToken() });

  return (
    <main className="dashboard">
      <header>
        <h1>blob viewer</h1>
        <p>{blobs.length} file{blobs.length === 1 ? "" : "s"}</p>
      </header>
      {blobs.length === 0 ? (
        <p className="empty">
          No files yet. Run <code>blob upload &lt;file&gt;</code> from the CLI.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>pathname</th>
              <th className="num">size</th>
              <th>uploaded</th>
            </tr>
          </thead>
          <tbody>
            {blobs.map((b) => (
              <tr key={b.pathname}>
                <td>
                  <a href={`/${b.pathname}`}>{b.pathname}</a>
                </td>
                <td className="num">{humanizeBytes(b.size)}</td>
                <td title={b.uploadedAt.toISOString()}>
                  {b.uploadedAt.toISOString().slice(0, 19).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

### Step 15.8: Create `viewer/app/globals.css`

- [ ] ```css
:root {
  color-scheme: dark;
  --bg: #0a0a0a;
  --fg: #d6d6d6;
  --muted: #888;
  --row-alt: #141414;
  --border: #2a2a2a;
  --link: #7fbcff;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
.dashboard { max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; }
header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
header h1 { margin: 0; font-size: 1.4rem; font-weight: 500; }
header p { color: var(--muted); margin: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 6px 12px; border-bottom: 1px solid var(--border); text-align: left; }
th { position: sticky; top: 0; background: var(--bg); font-weight: 500; color: var(--muted); }
tbody tr:nth-child(even) { background: var(--row-alt); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.empty { color: var(--muted); margin-top: 2rem; }
code { background: #1a1a1a; padding: 1px 6px; border-radius: 3px; }
```

### Step 15.9: Update `viewer/app/layout.tsx`

- [ ] Replace with:

```tsx
import "./globals.css";

export const metadata = { title: "blob viewer" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### Step 15.10: Smoke test the build

- [ ] Run from `viewer/`: `bunx next build`
Expected: `Compiled successfully`. The dashboard route is dynamic (cookies + redirect) — that's fine.

### Step 15.11: Commit

- [ ] ```bash
git add viewer/lib/list-blobs.ts viewer/lib/format.ts viewer/test/list-blobs.test.ts viewer/test/format.test.ts viewer/app/page.tsx viewer/app/globals.css viewer/app/layout.tsx
git commit -m "Viewer: dashboard with cookie gate, blob list, monospace UI"
```

---

## Task 16: Viewer README + deploy button

**Files:**
- Create: `viewer/README.md`

- [ ] **Step 16.1: Write `viewer/README.md`**

```markdown
# blob viewer

A small Next.js app you deploy once on Vercel. It proxies private Vercel Blob content with the right inline-render headers and exposes a password-gated dashboard listing your files.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bubuding0809/blob-cli&root-directory=viewer&env=BLOB_READ_WRITE_TOKEN,VIEWER_PASSWORD,VIEWER_SESSION_SECRET&envDescription=Token+from+your+Blob+store,+a+password+for+the+dashboard,+and+a+random+32-byte+secret&envLink=https://github.com/bubuding0809/blob-cli/tree/main/viewer%23environment-variables)

After clicking, Vercel will:
1. Clone the repo with `root-directory=viewer`.
2. Prompt for the three required env vars (see below).
3. Build and deploy. ~30s to a live URL.

Copy that URL and paste it into `blob init` on your local machine.

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
```

- [ ] **Step 16.2: Commit**

```bash
git add viewer/README.md
git commit -m "Viewer: README with Deploy-to-Vercel button and env-var docs"
```

---

## Task 17: Top-level README — link to the viewer

**Files:**
- Modify: `README.md`

- [ ] **Step 17.1: Replace `README.md` with:**

````markdown
# blob-cli

Tiny CLI for publishing files to your Vercel Blob store and getting back a URL that renders inline in any browser. Designed for AI agents that produce HTML output you'd rather view in a browser than read in a terminal.

## How it works (BYOB + BYOV)

You bring your own:
- **Blob store** (Vercel Blob, private access)
- **Viewer** — a small Next.js app you deploy once at [`viewer/`](./viewer) that proxies blob content with inline-render headers and gives you a password-gated file dashboard

The CLI uploads to your Blob store and prints URLs that point at your viewer. Your tokens never leave your Vercel account.

## Install

```bash
npm i -g blob-cli
```

## One-time setup

1. **Create a private Vercel Blob store.** Vercel dashboard → Storage → Create Database → Blob. Copy the `BLOB_READ_WRITE_TOKEN` from its `.env.local` tab.
2. **Deploy the viewer** using the [Deploy to Vercel button](./viewer/README.md). You'll set three env vars: the blob token, a dashboard password, and a session secret. Copy the deployment URL when it's done.
3. **Run** `blob init`. Paste the blob token, then paste the viewer URL. Done.

## Commands

```bash
blob upload report.html
# → https://blob-viewer-xxx.vercel.app/report-x7Ka2.html

blob list
# 2026-04-28T10:00:00Z   1234   https://blob-viewer-xxx.vercel.app/...

blob get <viewer-url-or-pathname> [--out file]

blob delete <viewer-url-or-pathname>
```

`upload`, `list`, `get` accept `--json` for machine-readable output.

## Notes

- File URLs are open — anyone with a link can view. Security is the unguessable random suffix on the pathname. Don't upload secrets.
- The dashboard at `/` on the viewer is password-protected.
- Each upload gets a random suffix; you can't overwrite an existing file in place.
- BYOB+BYOV means your data is in your Vercel project. We never see, store, or proxy it.
````

- [ ] **Step 17.2: Commit**

```bash
git add README.md
git commit -m "README: rewrite for BYOB+BYOV viewer architecture"
```

---

## Task 18: Final verification

- [ ] **Step 18.1: Full CLI test suite**

Run from repo root: `bun test`
Expected: all unit tests pass, integration tests skip.

- [ ] **Step 18.2: CLI type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 18.3: CLI build**

Run: `bun run build`
Expected: `dist/cli.js` produced.

- [ ] **Step 18.4: CLI smoke test**

Run: `node dist/cli.js --help`
Expected: usage banner with 5 subcommands.

- [ ] **Step 18.5: Viewer test suite**

Run from `viewer/`: `bun test`
Expected: all viewer unit tests pass (env, session, health, login, serve-blob, list-blobs, format).

- [ ] **Step 18.6: Viewer build**

Run from `viewer/`: `bunx next build`
Expected: `Compiled successfully`.

- [ ] **Step 18.7: No leftover placeholders**

Run: `grep -rn "not yet implemented\|TODO\|FIXME" src/ viewer/app/ viewer/lib/ || echo "clean"`
Expected: `clean`.

- [ ] **Step 18.8: Inspect git log**

Run: `git log --oneline | head -25`
Expected: a commit per task (~17–18 commits since the v0.1 work began on this branch), readable history.

- [ ] **Step 18.9: Final commit (if any housekeeping)**

If anything was modified during verification, commit. Otherwise nothing to do.

---

## Out of Scope (deferred — do NOT implement)

These were explicitly excluded by the spec — do not slip them in:

- Time-limited / per-recipient signed share URLs
- Browser-side upload, rename, or delete from the dashboard
- Pagination, search, or folder hierarchy in the dashboard
- Auto-deployment of the viewer from the CLI (`vercel deploy` shell-out)
- Hosted/shared multi-tenant viewer
- Custom domain configuration helper
- Multi-store support in one CLI install

If any of these surface as pressure during implementation, stop and re-spec.
