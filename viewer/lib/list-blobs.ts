import { list as sdkList, type ListCommandOptions } from "@vercel/blob";

export interface BlobRow {
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobsDeps {
  token: string;
  list?: (options: ListCommandOptions) => Promise<{
    blobs: BlobRow[];
    hasMore: boolean;
    cursor: string | undefined;
  }>;
}

export async function listBlobs(deps: ListBlobsDeps): Promise<BlobRow[]> {
  const list = deps.list ?? (sdkList as any);
  const result = await list({ token: deps.token, limit: 1000 });
  const sorted = [...result.blobs].sort(
    (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
  );
  return sorted;
}
