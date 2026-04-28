import { del as sdkDel } from "@vercel/blob";

import { resolveToken } from "../config.ts";
import { printResult as defaultPrintResult } from "../output.ts";

export interface DeleteOpts {
  urlOrPath: string;
  json: boolean;
}

export interface DeleteDeps {
  token?: string;
  del?: (
    urlOrPath: string | string[],
    options: { token: string },
  ) => Promise<void>;
  printResult?: typeof defaultPrintResult;
}

export async function runDelete(
  opts: DeleteOpts,
  deps: DeleteDeps = {},
): Promise<void> {
  const token = deps.token ?? resolveToken();
  const del = deps.del ?? sdkDel;
  const printResult = deps.printResult ?? defaultPrintResult;

  await del(opts.urlOrPath, { token });

  printResult(
    {
      text: `deleted: ${opts.urlOrPath}`,
      json: { deleted: opts.urlOrPath },
    },
    { json: opts.json },
  );
}
