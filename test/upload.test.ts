import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runUpload } from "../src/commands/upload.ts";

describe("runUpload", () => {
  test("calls put with file content, public access, random suffix, and inferred content type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "report.html");
    writeFileSync(file, "<html>hi</html>");

    let captured: any = null;
    const fakePut = async (name: string, body: any, options: any) => {
      captured = { name, body: body.toString(), options };
      return { url: "https://store.public.blob.vercel-storage.com/report-x.html" };
    };

    let printed = "";
    const fakePrintResult = (result: any, _opts: any) => {
      printed = result.text;
    };

    await runUpload(
      { path: file, json: false },
      {
        token: "blob_rw_test",
        put: fakePut,
        printResult: fakePrintResult,
      },
    );

    expect(captured.name).toBe("report.html");
    expect(captured.body).toBe("<html>hi</html>");
    expect(captured.options.access).toBe("public");
    expect(captured.options.addRandomSuffix).toBe(true);
    expect(captured.options.contentType).toBe("text/html");
    expect(captured.options.token).toBe("blob_rw_test");
    expect(printed).toBe("https://store.public.blob.vercel-storage.com/report-x.html");

    rmSync(dir, { recursive: true, force: true });
  });

  test("--name overrides the basename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "anything.txt");
    writeFileSync(file, "hello");

    let captured: any = null;
    await runUpload(
      { path: file, name: "renamed.txt", json: false },
      {
        token: "t",
        put: async (name, _body, _opts) => {
          captured = name;
          return { url: "https://x" };
        },
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
      { path: file, json: false },
      {
        token: "t",
        put: async (_n, _b, opts) => {
          capturedType = opts.contentType;
          return { url: "https://x" };
        },
        printResult: () => {},
      },
    );
    expect(capturedType).toBe("application/octet-stream");

    rmSync(dir, { recursive: true, force: true });
  });

  test("--json mode prints url as JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-test-"));
    const file = join(dir, "x.txt");
    writeFileSync(file, "y");

    let printedJson: any = null;
    await runUpload(
      { path: file, json: true },
      {
        token: "t",
        put: async () => ({ url: "https://x.com/y" }),
        printResult: (result, opts) => {
          if (opts.json) printedJson = result.json;
        },
      },
    );
    expect(printedJson).toEqual({ url: "https://x.com/y" });

    rmSync(dir, { recursive: true, force: true });
  });
});
