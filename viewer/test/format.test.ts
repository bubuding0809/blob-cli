import { describe, test, expect } from "bun:test";
import { humanizeBytes } from "../lib/format.ts";

describe("humanizeBytes", () => {
  test("bytes", () => {
    expect(humanizeBytes(0)).toBe("0 B");
    expect(humanizeBytes(512)).toBe("512 B");
    expect(humanizeBytes(1023)).toBe("1023 B");
  });
  test("KB", () => {
    expect(humanizeBytes(1024)).toBe("1.0 KB");
    expect(humanizeBytes(1536)).toBe("1.5 KB");
  });
  test("MB", () => {
    expect(humanizeBytes(1024 * 1024)).toBe("1.0 MB");
    expect(humanizeBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  test("GB", () => {
    expect(humanizeBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});
