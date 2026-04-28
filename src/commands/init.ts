export interface InitOpts {
  force: boolean;
  json: boolean;
}

export async function runInit(_opts: InitOpts): Promise<void> {
  throw new Error("init: not yet implemented");
}
