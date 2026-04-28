import { list as sdkList, BlobAccessError, type ListCommandOptions, type ListBlobResult } from "@vercel/blob";

import { readConfig, writeConfig, configPath } from "../config.ts";
import { openUrl } from "../browser.ts";
import { prompt as defaultPrompt, type PromptFn } from "../prompt.ts";

export interface InitOpts {
  force: boolean;
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

export interface InitDeps {
  prompt?: PromptFn;
  validate?: (token: string) => Promise<boolean>;
  openBrowser?: (url: string) => Promise<void>;
  log?: (msg: string) => void;
}

const VERCEL_BLOB_URL = "https://vercel.com/dashboard/stores";
const MAX_ATTEMPTS = 3;

export async function runInit(opts: InitOpts, deps: InitDeps = {}): Promise<void> {
  const ask = deps.prompt ?? defaultPrompt;
  const validate = deps.validate ?? ((t: string) => validateToken(t));
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

  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    let token = await ask("Token (or Enter): ");
    if (!token) {
      log(`Opening ${VERCEL_BLOB_URL} in your browser…`);
      await openBrowser(VERCEL_BLOB_URL);
      log("Steps:");
      log("  1. Sign in or sign up (free).");
      log("  2. Create Database → Blob → name & region.");
      log("  3. Open the new store's '.env.local' tab.");
      log("  4. Copy the BLOB_READ_WRITE_TOKEN value (starts with 'blob_rw_').");
      token = await ask("Paste token here: ");
    }

    log("Validating token…");
    const ok = await validate(token);
    if (ok) {
      writeConfig(token);
      log(`✓ saved to ${configPath()} (chmod 0600)`);
      log("You're set. Try:  blob upload README.md");
      return;
    }

    attempts++;
    log(`✗ token rejected by Vercel. ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
  }

  throw new Error(`init failed after ${MAX_ATTEMPTS} attempts`);
}
