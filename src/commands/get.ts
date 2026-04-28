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
