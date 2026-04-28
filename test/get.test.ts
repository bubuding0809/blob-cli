import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGet } from "../src/commands/get.ts";

describe("runGet", () => {
  test("fetches a URL directly when input is http(s)", async () => {
    let fetched: string | null = null;
    let written = "";
    await runGet(
      { urlOrPath: "https://example.com/x.html" },
      {
        token: "t",
        head: async () => {
          throw new Error("should not be called for direct URL");
        },
        fetch: (async (u: string) => {
          fetched = u;
          return new Response("hello");
        }) as any,
        writeStdout: (chunk: Buffer) => {
          written += chunk.toString();
        },
      },
    );
    expect(fetched as any).toBe("https://example.com/x.html");
    expect(written).toBe("hello");
  });

  test("resolves a pathname via head(), then fetches", async () => {
    let headCalled: string | null = null;
    let fetched: string | null = null;
    await runGet(
      { urlOrPath: "report.html" },
      {
        token: "t",
        head: async (p: string) => {
          headCalled = p;
          return { url: "https://store/report-x.html" } as any;
        },
        fetch: (async (u: string) => {
          fetched = u;
          return new Response("body");
        }) as any,
        writeStdout: () => {},
      },
    );
    expect(headCalled as any).toBe("report.html");
    expect(fetched as any).toBe("https://store/report-x.html");
  });

  test("--out writes to file instead of stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "get-test-"));
    const out = join(dir, "out.html");
    let stdoutWritten = "";
    await runGet(
      { urlOrPath: "https://x/y", out },
      {
        token: "t",
        head: async () => ({ url: "" } as any),
        fetch: (async () => new Response("filebody")) as any,
        writeStdout: (chunk: Buffer) => {
          stdoutWritten += chunk.toString();
        },
      },
    );
    expect(readFileSync(out, "utf8")).toBe("filebody");
    expect(stdoutWritten).toBe("");
    rmSync(dir, { recursive: true, force: true });
  });

  test("non-2xx response throws", async () => {
    await expect(
      runGet(
        { urlOrPath: "https://x/y" },
        {
          token: "t",
          head: async () => ({ url: "" } as any),
          fetch: (async () => new Response("not found", { status: 404 })) as any,
          writeStdout: () => {},
        },
      ),
    ).rejects.toThrow(/404/);
  });
});
