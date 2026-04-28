export interface DeleteOpts {
  urlOrPath: string;
  json: boolean;
}

export async function runDelete(_opts: DeleteOpts): Promise<void> {
  throw new Error("delete: not yet implemented");
}
