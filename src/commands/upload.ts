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
