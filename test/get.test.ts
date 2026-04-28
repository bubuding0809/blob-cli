import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGet } from "../src/commands/get.ts";

const okGet = (body: string) =>
  ((async () => ({
    statusCode: 200,
    stream: new Response(body).body!,
    headers: new Headers({ "content-type": "text/html" }),
    blob: { pathname: "x.html" },
  })) as any);

describe("runGet", () => {
  test("extracts pathname from a viewer URL and calls SDK get with private access", async () => {
    let captured: any = null;
    let written = "";
    await runGet(
      { urlOrPath: "https://v.example.com/report-x.html" },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: (async (pathname: string, options: any) => {
          captured = { pathname, options };
          return {
            statusCode: 200,
            stream: new Response("hello").body!,
            headers: new Headers({ "content-type": "text/html" }),
            blob: { pathname: "report-x.html" },
          };
        }) as any,
        writeStdout: (chunk: Buffer) => {
          written += chunk.toString();
        },
      },
    );
    expect(captured.pathname).toBe("report-x.html");
    expect(captured.options.access).toBe("private");
    expect(captured.options.token).toBe("t");
    expect(written).toBe("hello");
  });

  test("treats bare pathname as pathname directly", async () => {
    let captured = "";
    await runGet(
      { urlOrPath: "report-x.html" },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: (async (pathname: string) => {
          captured = pathname;
          return {
            statusCode: 200,
            stream: new Response("body").body!,
            headers: new Headers(),
            blob: { pathname },
          };
        }) as any,
        writeStdout: () => {},
      },
    );
    expect(captured).toBe("report-x.html");
  });

  test("rejects an http(s) URL that doesn't match the viewer", async () => {
    await expect(
      runGet(
        { urlOrPath: "https://other.example.com/x.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: okGet("x"),
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/viewer URL|pathname/);
  });

  test("--out writes to file instead of stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "get-test-"));
    const out = join(dir, "out.html");
    let stdoutWritten = "";
    await runGet(
      { urlOrPath: "x.html", out },
      {
        token: "t",
        viewerUrl: "https://v.example.com",
        get: okGet("filebody"),
        writeStdout: (chunk: Buffer) => {
          stdoutWritten += chunk.toString();
        },
      },
    );
    expect(readFileSync(out, "utf8")).toBe("filebody");
    expect(stdoutWritten).toBe("");
    rmSync(dir, { recursive: true, force: true });
  });

  test("throws on null result (not found)", async () => {
    await expect(
      runGet(
        { urlOrPath: "missing.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: (async () => null) as any,
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/not found/i);
  });

  test("throws on 304 result", async () => {
    await expect(
      runGet(
        { urlOrPath: "x.html" },
        {
          token: "t",
          viewerUrl: "https://v.example.com",
          get: (async () => ({ statusCode: 304, stream: null, headers: new Headers(), blob: null })) as any,
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/not found|304/i);
  });
});
