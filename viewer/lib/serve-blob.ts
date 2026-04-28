import { get as sdkGet, type GetBlobResult } from "@vercel/blob";

export interface ServeBlobDeps {
  token: string;
  get?: (
    pathname: string,
    options: { access: "private"; token: string },
  ) => Promise<GetBlobResult | null>;
}

export async function serveBlob(pathname: string, deps: ServeBlobDeps): Promise<Response> {
  const doGet = deps.get ?? sdkGet;
  const result = await doGet(pathname, { access: "private", token: deps.token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new Response("Not found", { status: 404 });
  }
  const contentType = result.headers.get("content-type") ?? "application/octet-stream";
  const filename = pathname.split("/").pop() ?? pathname;
  const safeFilename = filename.replace(/"/g, "");
  return new Response(result.stream, {
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${safeFilename}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
