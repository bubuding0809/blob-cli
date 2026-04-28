import { describe, test, expect } from "bun:test";
import { serveBlob } from "../lib/serve-blob.ts";

const okGet = (body: string, contentType: string) =>
  ((async () => ({
    statusCode: 200,
    stream: new Response(body).body!,
    headers: new Headers({ "content-type": contentType }),
    blob: { pathname: "x" },
  })) as any);

describe("serveBlob", () => {
  test("returns 200 with inline content-disposition and original content-type", async () => {
    const res = await serveBlob("report.html", {
      token: "t",
      get: okGet("<h1>hi</h1>", "text/html"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="report.html"',
    );
    expect(await res.text()).toBe("<h1>hi</h1>");
  });

  test("falls back to application/octet-stream when content-type missing", async () => {
    const res = await serveBlob("anon", {
      token: "t",
      get: (async () => ({
        statusCode: 200,
        stream: new Response("x").body!,
        headers: new Headers(),
        blob: { pathname: "anon" },
      })) as any,
    });
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  test("uses last path segment for filename in content-disposition", async () => {
    const res = await serveBlob("dir/sub/report-x.html", {
      token: "t",
      get: okGet("x", "text/html"),
    });
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="report-x.html"',
    );
  });

  test("returns 404 when get returns null", async () => {
    const res = await serveBlob("missing", {
      token: "t",
      get: (async () => null) as any,
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 when get returns 304", async () => {
    const res = await serveBlob("x", {
      token: "t",
      get: (async () => ({
        statusCode: 304,
        stream: null,
        headers: new Headers(),
        blob: null,
      })) as any,
    });
    expect(res.status).toBe(404);
  });

  test("calls SDK with access=private and supplied token", async () => {
    let captured: any = null;
    await serveBlob("x", {
      token: "secret",
      get: (async (pathname: string, options: any) => {
        captured = { pathname, options };
        return {
          statusCode: 200,
          stream: new Response("x").body!,
          headers: new Headers({ "content-type": "text/plain" }),
          blob: { pathname },
        };
      }) as any,
    });
    expect(captured.pathname).toBe("x");
    expect(captured.options.access).toBe("private");
    expect(captured.options.token).toBe("secret");
  });

  test("strips double-quotes from content-disposition filename", async () => {
    const res = await serveBlob('report"evil.html', {
      token: "t",
      get: okGet("x", "text/html"),
    });
    expect(res.headers.get("content-disposition")).toBe('inline; filename="reportevil.html"');
  });
});
