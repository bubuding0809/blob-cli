export interface GetOpts {
  urlOrPath: string;
  out?: string;
  json: boolean;
}

export async function runGet(_opts: GetOpts): Promise<void> {
  throw new Error("get: not yet implemented");
}
