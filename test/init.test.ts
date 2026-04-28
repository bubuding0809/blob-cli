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
        prompt: async (q: string) => {
          if (q.includes("Token")) return "blob_rw_ok";
          if (/Viewer URL|viewer url/i.test(q)) return "https://v.example.com";
          return "";
        },
        validate: async (t) => t === "blob_rw_ok",
        validateViewer: async () => true,
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
        prompt: async (q: string) => {
          if (/Viewer URL|viewer url/i.test(q)) return "https://v.example.com";
          return responses[i++] ?? "";
        },
        validate: async () => true,
        validateViewer: async () => true,
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
          validateViewer: async () => true,
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
        validateViewer: async () => true,
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
        prompt: async (q: string) => {
          if (/Viewer URL|viewer url/i.test(q)) return "https://v.example.com";
          return "blob_rw_new";
        },
        validate: async () => true,
        validateViewer: async () => true,
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
        validateViewer: async () => true,
        openBrowser: async () => {},
        ...stubLog(),
      },
    );
    expect(confirmAsked).toBe(true);
    expect(validateCalled).toBe(false);
    const cfg = JSON.parse(readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"));
    expect(cfg.token).toBe("blob_rw_old");
  });

  test("prompts for viewer URL after token, saves both", async () => {
    await runInit(
      { force: false },
      {
        prompt: async (q: string) => {
          if (q.includes("Token")) return "blob_rw_ok";
          if (/Viewer URL|viewer url/i.test(q)) return "https://v.example.com";
          return "";
        },
        validate: async () => true,
        validateViewer: async () => true,
        openBrowser: async () => {},
        log: () => {},
      },
    );
    const cfg = JSON.parse(
      readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"),
    );
    expect(cfg.token).toBe("blob_rw_ok");
    expect(cfg.viewerUrl).toBe("https://v.example.com");
  });

  test("retries viewer URL up to 3 times then throws", async () => {
    let viewerCalls = 0;
    await expect(
      runInit(
        { force: false },
        {
          prompt: async (q: string) => {
            if (q.includes("Token")) return "blob_rw_ok";
            return "https://wrong.example.com";
          },
          validate: async () => true,
          validateViewer: async () => {
            viewerCalls++;
            return false;
          },
          openBrowser: async () => {},
          log: () => {},
        },
      ),
    ).rejects.toThrow(/3 attempts/);
    expect(viewerCalls).toBe(3);
  });

  test("empty viewer URL prompt does not consume an attempt; shows deploy guidance", async () => {
    let viewerCalls = 0;
    let promptCalls = 0;
    const responses = ["", "", "https://v.example.com"];
    await runInit(
      { force: false },
      {
        prompt: async (q: string) => {
          if (q.includes("Token")) return "blob_rw_ok";
          promptCalls++;
          return responses[Math.min(promptCalls - 1, responses.length - 1)];
        },
        validate: async () => true,
        validateViewer: async () => {
          viewerCalls++;
          return true;
        },
        openBrowser: async () => {},
        log: () => {},
      },
    );
    // 3 prompts (2 empty, 1 success) but only 1 viewer validation
    expect(promptCalls).toBe(3);
    expect(viewerCalls).toBe(1);
  });

  test("non-interactive: --token + --viewer-url skip prompts", async () => {
    const promptCalls: string[] = [];
    await runInit(
      { force: false, token: "blob_rw_ok", viewerUrl: "https://v.example.com" },
      {
        prompt: async (q: string) => {
          promptCalls.push(q);
          return "";
        },
        validate: async (t) => t === "blob_rw_ok",
        validateViewer: async () => true,
        openBrowser: async () => {},
        log: () => {},
      },
    );
    expect(promptCalls).toEqual([]);
    const cfg = JSON.parse(
      readFileSync(join(tmpHome, ".config/blob-cli/config.json"), "utf8"),
    );
    expect(cfg.token).toBe("blob_rw_ok");
    expect(cfg.viewerUrl).toBe("https://v.example.com");
  });

  test("non-interactive: invalid --token throws without prompting", async () => {
    const promptCalls: string[] = [];
    await expect(
      runInit(
        { force: false, token: "bad", viewerUrl: "https://v.example.com" },
        {
          prompt: async (q: string) => {
            promptCalls.push(q);
            return "";
          },
          validate: async () => false,
          validateViewer: async () => true,
          openBrowser: async () => {},
          log: () => {},
        },
      ),
    ).rejects.toThrow(/token/i);
    expect(promptCalls).toEqual([]);
  });

  test("non-interactive: invalid --viewer-url throws without prompting", async () => {
    await expect(
      runInit(
        { force: false, token: "blob_rw_ok", viewerUrl: "https://bad.example.com" },
        {
          prompt: async () => "",
          validate: async () => true,
          validateViewer: async () => false,
          openBrowser: async () => {},
          log: () => {},
        },
      ),
    ).rejects.toThrow(/viewer/i);
  });
});
