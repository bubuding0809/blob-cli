import { writeFile } from "node:fs/promises";
import { head as sdkHead, type HeadBlobResult } from "@vercel/blob";

import { resolveToken } from "../config.ts";

export interface GetOpts {
  urlOrPath: string;
  out?: string;
}

export interface GetDeps {
  token?: string;
  head?: (pathname: string, options: { token: string }) => Promise<HeadBlobResult>;
  fetch?: typeof fetch;
  writeStdout?: (chunk: Buffer) => void;
}

export async function runGet(opts: GetOpts, deps: GetDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const head = deps.head ?? sdkHead;
  const doFetch = deps.fetch ?? fetch;
  const writeStdout =
    deps.writeStdout ?? ((chunk: Buffer) => process.stdout.write(chunk));

  let url: string;
  if (/^https?:\/\//i.test(opts.urlOrPath)) {
    url = opts.urlOrPath;
  } else {
    const meta = await head(opts.urlOrPath, { token });
    url = meta.url;
  }

  const res = await doFetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (opts.out) {
    await writeFile(opts.out, buf);
  } else {
    writeStdout(buf);
  }
}
