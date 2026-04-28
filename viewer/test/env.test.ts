import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getBlobToken, getViewerPassword, getViewerSessionSecret } from "../lib/env.ts";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VIEWER_PASSWORD: process.env.VIEWER_PASSWORD,
    VIEWER_SESSION_SECRET: process.env.VIEWER_SESSION_SECRET,
  };
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VIEWER_PASSWORD;
  delete process.env.VIEWER_SESSION_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("env helpers", () => {
  test("getBlobToken throws when missing", () => {
    expect(() => getBlobToken()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  test("getBlobToken returns the value when set", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_x";
    expect(getBlobToken()).toBe("blob_rw_x");
  });

  test("getViewerPassword throws when missing", () => {
    expect(() => getViewerPassword()).toThrow(/VIEWER_PASSWORD/);
  });

  test("getViewerPassword returns the value when set", () => {
    process.env.VIEWER_PASSWORD = "hunter2";
    expect(getViewerPassword()).toBe("hunter2");
  });

  test("getViewerSessionSecret throws when missing", () => {
    expect(() => getViewerSessionSecret()).toThrow(/VIEWER_SESSION_SECRET/);
  });

  test("getViewerSessionSecret returns the value when set", () => {
    process.env.VIEWER_SESSION_SECRET = "abc123";
    expect(getViewerSessionSecret()).toBe("abc123");
  });
});
