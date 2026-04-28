import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConfig, writeConfig, resolveToken, configPath } from "../src/config.ts";

let tmpHome: string;
let originalHome: string | undefined;
let originalToken: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "blob-cli-test-"));
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

describe("configPath", () => {
  test("returns ~/.config/blob-cli/config.json", () => {
    expect(configPath()).toBe(join(tmpHome, ".config/blob-cli/config.json"));
  });
});

describe("readConfig", () => {
  test("returns null when file missing", () => {
    expect(readConfig()).toBeNull();
  });

  test("returns null when JSON malformed", () => {
    mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
    writeFileSync(configPath(), "{not json");
    expect(readConfig()).toBeNull();
  });

  test("returns parsed config when valid", () => {
    mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ token: "blob_rw_abc" }));
    expect(readConfig()).toEqual({ token: "blob_rw_abc" });
  });

  test("returns config with viewerUrl when present", () => {
    mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
    writeFileSync(
      configPath(),
      JSON.stringify({ token: "blob_rw_abc", viewerUrl: "https://v.example.com" }),
    );
    expect(readConfig()).toEqual({
      token: "blob_rw_abc",
      viewerUrl: "https://v.example.com",
    });
  });

  test("returns config with viewerUrl undefined when missing", () => {
    mkdirSync(join(tmpHome, ".config/blob-cli"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ token: "blob_rw_abc" }));
    expect(readConfig()).toEqual({ token: "blob_rw_abc" });
  });
});

describe("writeConfig", () => {
  test("creates directory if missing", () => {
    writeConfig({ token: "blob_rw_xyz" });
    expect(existsSync(configPath())).toBe(true);
  });

  test("writes file with mode 0600", () => {
    writeConfig({ token: "blob_rw_xyz" });
    const mode = statSync(configPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("round-trips token only with readConfig", () => {
    writeConfig({ token: "blob_rw_round" });
    expect(readConfig()).toEqual({ token: "blob_rw_round" });
  });

  test("round-trips token + viewerUrl with readConfig", () => {
    writeConfig({ token: "blob_rw_round", viewerUrl: "https://v.example.com" });
    expect(readConfig()).toEqual({
      token: "blob_rw_round",
      viewerUrl: "https://v.example.com",
    });
  });
});

describe("resolveToken", () => {
  test("env var wins over file", () => {
    writeConfig({ token: "blob_rw_file" });
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_env";
    expect(resolveToken()).toBe("blob_rw_env");
  });

  test("falls back to file when env unset", () => {
    writeConfig({ token: "blob_rw_file" });
    expect(resolveToken()).toBe("blob_rw_file");
  });

  test("throws when neither set", () => {
    expect(() => resolveToken()).toThrow(/blob init/);
  });
});
