import { serveBlob } from "@/lib/serve-blob.ts";
import { getBlobToken } from "@/lib/env.ts";

export async function GET(
  _request: Request,
  { params }: { params: { pathname: string[] } },
) {
  const pathname = params.pathname.join("/");
  return serveBlob(pathname, { token: getBlobToken() });
}
