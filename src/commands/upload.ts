import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { lookup as lookupMime } from "mime-types";
import { put as sdkPut, type PutCommandOptions, type PutBlobResult } from "@vercel/blob";

import { resolveToken } from "../config.ts";
import { printResult as defaultPrintResult } from "../output.ts";

export interface UploadOpts {
  path: string;
  name?: string;
  json: boolean;
}

export interface UploadDeps {
  token?: string;
  put?: (
    name: string,
    body: Buffer | string,
    options: PutCommandOptions,
  ) => Promise<PutBlobResult>;
  printResult?: typeof defaultPrintResult;
}

export async function runUpload(opts: UploadOpts, deps: UploadDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const put = deps.put ?? sdkPut;
  const printResult = deps.printResult ?? defaultPrintResult;

  const body = await readFile(opts.path);
  const name = opts.name ?? basename(opts.path);
  const contentType = lookupMime(name) || "application/octet-stream";

  const blob = await put(name, body, {
    access: "public",
    addRandomSuffix: true,
    contentType,
    token,
  });

  printResult(
    { text: blob.url, json: { url: blob.url } },
    { json: opts.json },
  );
}
