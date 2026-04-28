import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runUpload } from "../src/commands/upload.ts";
import { runList } from "../src/commands/list.ts";
import { runGet } from "../src/commands/get.ts";
import { runDelete } from "../src/commands/delete.ts";

const token = process.env.BLOB_TEST_TOKEN;
const describeIf = token ? describe : describe.skip;

describeIf("integration: full CRUD against real Vercel Blob", () => {
  let dir: string;
  let uploadedUrl: string | null = null;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "blob-int-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("upload prints a URL", async () => {
    const file = join(dir, "smoke.html");
    writeFileSync(file, `<h1>integration ${Date.now()}</h1>`);

    let captured = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: any) => {
      captured += c.toString();
      return true;
    }) as any;

    try {
      await runUpload({ path: file, json: false }, { token: token! });
    } finally {
      process.stdout.write = origWrite;
    }

    uploadedUrl = captured.trim();
    expect(uploadedUrl).toMatch(/^https:\/\/.*\.public\.blob\.vercel-storage\.com\//);
  });

  test("list contains the uploaded blob", async () => {
    let captured = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: any) => {
      captured += c.toString();
      return true;
    }) as any;

    try {
      await runList({ limit: 100, json: false }, { token: token! });
    } finally {
      process.stdout.write = origWrite;
    }

    expect(captured).toContain(uploadedUrl!);
  });

  test("get fetches the uploaded content", async () => {
    const out = join(dir, "fetched.html");
    await runGet({ urlOrPath: uploadedUrl!, out, json: false }, { token: token! });
    const content = readFileSync(out, "utf8");
    expect(content).toContain("integration");
  });

  test("delete removes it", async () => {
    await runDelete({ urlOrPath: uploadedUrl!, json: false }, { token: token! });
    // After delete, fetching should fail with 4xx
    const res = await fetch(uploadedUrl!);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
