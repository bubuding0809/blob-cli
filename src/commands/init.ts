import { list as sdkList, BlobAccessError, type ListCommandOptions, type ListBlobResult } from "@vercel/blob";

import { readConfig, writeConfig, configPath } from "../config.ts";
import { openUrl } from "../browser.ts";
import { prompt as defaultPrompt, type PromptFn } from "../prompt.ts";

export interface InitOpts {
  force: boolean;
  token?: string;
  viewerUrl?: string;
}

export interface ValidateDeps {
  list?: (options: ListCommandOptions) => Promise<ListBlobResult>;
}

export async function validateToken(
  token: string,
  deps: ValidateDeps = {},
): Promise<boolean> {
  const list = deps.list ?? sdkList;
  try {
    await list({ limit: 1, token });
    return true;
  } catch (err) {
    if (err instanceof BlobAccessError) return false;
    throw err;
  }
}

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

  // Phase 1: token
  let token = "";
  if (opts.token) {
    log("Validating provided token…");
    if (!(await validate(opts.token))) {
      throw new Error("provided --token was rejected by Vercel");
    }
    token = opts.token;
  } else {
    log("blob-cli needs a Vercel Blob token. (See: https://vercel.com/docs/storage/vercel-blob)");
    log("  Already have a token?  Paste it below.");
    log("  Don't have one yet?    Press Enter and I'll open the page.");
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
      const candidate = (await ask("Viewer URL (e.g. https://blob-viewer-xxx.vercel.app): ")).replace(
        /\/+$/,
        "",
      );
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

  writeConfig({ token, viewerUrl });
  log(`✓ saved to ${configPath()} (chmod 0600)`);
  log("You're set. Try:  blob upload README.md");
}
