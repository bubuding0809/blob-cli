import { list as sdkList, type ListCommandOptions, type ListBlobResult } from "@vercel/blob";

import { resolveToken } from "../config.ts";
import { printResult as defaultPrintResult } from "../output.ts";

export interface ListOpts {
  prefix?: string;
  limit: number;
  json: boolean;
}

export interface ListDeps {
  token?: string;
  list?: (options: ListCommandOptions) => Promise<ListBlobResult>;
  printResult?: typeof defaultPrintResult;
}

export async function runList(opts: ListOpts, deps: ListDeps = {}): Promise<void> {
  const token = deps.token ?? resolveToken();
  const list = deps.list ?? sdkList;
  const printResult = deps.printResult ?? defaultPrintResult;

  const result = await list({
    prefix: opts.prefix,
    limit: opts.limit,
    token,
  });

  const text = result.blobs
    .map((b) => `${b.uploadedAt.toISOString()}\t${b.size}\t${b.url}`)
    .join("\n");

  printResult(
    {
      text,
      json: {
        blobs: result.blobs.map((b) => ({
          url: b.url,
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt.toISOString(),
        })),
      },
    },
    { json: opts.json },
  );
}
