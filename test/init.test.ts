import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../src/commands/init.ts";

let tmpHome: string;
let originalHome: string | undefined;
let originalToken: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "init-test-"));
  originalHome = process.env.HOME;
  originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.HOME = tmpHome;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (originalHome !== undefined) process.env.HOME = originalHome;
  if (originalToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = originalToken;
});

const stubLog = () => ({ log: () => {} });

describe("runInit", () => {
  test("happy path: prompts, validates, writes config", async () => {
    await runInit(
      { force: false },
      {
        prompt: async (q: string) => (q.includes("Token") ? "blob_rw_ok" : ""),
        validate: async (t) => t === "blob_rw_ok",
        openBrowser: async () => {},
        ...stubLog(),
      },
    );
    const cfg = JSON.parse(readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"));
    expect(cfg.token).toBe("blob_rw_ok");
  });

  test("opens browser on empty first response, then prompts again", async () => {
    let opened = 0;
    const responses = ["", "blob_rw_ok"];
    let i = 0;
    await runInit(
      { force: false },
      {
        prompt: async () => responses[i++] ?? "",
        validate: async () => true,
        openBrowser: async () => {
          opened++;
        },
        ...stubLog(),
      },
    );
    expect(opened).toBe(1);
  });

  test("retries up to 3 times on validation failure", async () => {
    let validateCalls = 0;
    let promptCalls = 0;
    await expect(
      runInit(
        { force: false },
        {
          prompt: async () => {
            promptCalls++;
            return "blob_rw_bad";
          },
          validate: async () => {
            validateCalls++;
            return false;
          },
          openBrowser: async () => {},
          ...stubLog(),
        },
      ),
    ).rejects.toThrow(/3 attempts/);
    expect(validateCalls).toBe(3);
    expect(promptCalls).toBe(3);
  });

  test("exits early when env var set and not --force", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_env";
    let validateCalled = false;
    await runInit(
      { force: false },
      {
        prompt: async () => "x",
        validate: async () => {
          validateCalled = true;
          return true;
        },
        openBrowser: async () => {},
        ...stubLog(),
      },
    );
    expect(validateCalled).toBe(false);
    expect(existsSync(join(tmpHome, ".config/blob-cli/config.json"))).toBe(false);
  });

  test("--force overrides env var notice", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_env";
    await runInit(
      { force: true },
      {
        prompt: async () => "blob_rw_new",
        validate: async () => true,
        openBrowser: async () => {},
        ...stubLog(),
      },
    );
    const cfg = JSON.parse(readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"));
    expect(cfg.token).toBe("blob_rw_new");
  });

  test("prompts to confirm overwrite when config exists and --force not set", async () => {
    // Pre-write a config
    const { writeConfig } = await import("../src/config.ts");
    writeConfig({ token: "blob_rw_old" });

    let confirmAsked = false;
    let validateCalled = false;
    await runInit(
      { force: false },
      {
        prompt: async (q: string) => {
          if (/overwrite/i.test(q)) {
            confirmAsked = true;
            return "n";
          }
          return "blob_rw_new";
        },
        validate: async () => {
          validateCalled = true;
          return true;
        },
        openBrowser: async () => {},
        ...stubLog(),
      },
    );
    expect(confirmAsked).toBe(true);
    expect(validateCalled).toBe(false);
    const cfg = JSON.parse(readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"));
    expect(cfg.token).toBe("blob_rw_old");
  });
});
