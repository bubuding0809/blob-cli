import { list as sdkList, type ListCommandOptions, type ListBlobResult } from "@vercel/blob";

export interface InitOpts {
  force: boolean;
  json: boolean;
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
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return false;
    throw err;
  }
}

export async function runInit(_opts: InitOpts): Promise<void> {
  throw new Error("init: not yet implemented");
}
