import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runUpload } from "../src/commands/upload.ts";

describe("runUpload", () => {
  test("calls put with private access, random suffix, inferred content type, and prints viewer URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "report.html");
    writeFileSync(file, "<html>hi</html>");

    let captured: any = null;
    const fakePut = (async (name: string, body: any, options: any) => {
      captured = { name, body: body.toString(), options };
      return {
        url: "https://store.public.blob.vercel-storage.com/report-x.html",
        pathname: "report-x.html",
      };
    }) as any;

    let printed = "";
    const fakePrintResult = (result: any, _opts: any) => {
      printed = result.text;
    };

    await runUpload(
      { path: file },
      {
        token: "blob_rw_test",
        viewerUrl: "https://v.example.com",
        put: fakePut,
        printResult: fakePrintResult,
      },
    );

    expect(captured.name).toBe("report.html");
    expect(captured.body).toBe("<html>hi</html>");
    expect(captured.options.access).toBe("private");
    expect(captured.options.addRandomSuffix).toBe(true);
    expect(captured.options.contentType).toBe("text/html");
    expect(captured.options.token).toBe("blob_rw_test");
    expect(printed).toBe("https://v.example.com/report-x.html");

    rmSync(dir, { recursive: true, force: true });
  });

  test("--name overrides the basename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "anything.txt");
    writeFileSync(file, "hello");

    let captured = "";
    await runUpload(
      { path: file, name: "renamed.txt" },
      {
        token: "t",
        viewerUrl: "https://v",
        put: (async (name: string) => {
          captured = name;
          return { url: "https://x", pathname: "renamed-x.txt" };
        }) as any,
        printResult: () => {},
      },
    );
    expect(captured).toBe("renamed.txt");
    rmSync(dir, { recursive: true, force: true });
  });

  test("falls back to application/octet-stream for unknown extensions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "data.weirdext");
    writeFileSync(file, "x");

    let capturedType: string | undefined;
    await runUpload(
      { path: file },
      {
        token: "t",
        viewerUrl: "https://v",
        put: (async (_n: string, _b: any, opts: any) => {
          capturedType = opts.contentType;
          return { url: "https://x", pathname: "data-x.weirdext" };
        }) as any,
        printResult: () => {},
      },
    );
    expect(capturedType).toBe("application/octet-stream");
    rmSync(dir, { recursive: true, force: true });
  });

  test("printed viewer URL strips trailing slash on viewerUrl", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "x.html");
    writeFileSync(file, "y");

    let printed = "";
    await runUpload(
      { path: file },
      {
        token: "t",
        viewerUrl: "https://v.example.com/",
        put: (async () => ({ url: "https://blob/x-x.html", pathname: "x-x.html" })) as any,
        printResult: (r: any) => {
          printed = r.text;
        },
      },
    );
    expect(printed).toBe("https://v.example.com/x-x.html");
    rmSync(dir, { recursive: true, force: true });
  });
});
