export interface UploadOpts {
  path: string;
  name?: string;
  json: boolean;
}

export async function runUpload(_opts: UploadOpts): Promise<void> {
  throw new Error("upload: not yet implemented");
}
