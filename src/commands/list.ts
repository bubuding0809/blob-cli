export interface ListOpts {
  prefix?: string;
  limit: number;
  json: boolean;
}

export async function runList(_opts: ListOpts): Promise<void> {
  throw new Error("list: not yet implemented");
}
