import { describe, test, expect } from "bun:test";
import { openUrl } from "../src/browser.ts";

describe("openUrl", () => {
  test("uses 'open' on darwin", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { unref() {} } as any;
    };
    await openUrl("https://example.com", { platform: "darwin", spawn: fakeSpawn });
    expect(calls).toEqual([{ cmd: "open", args: ["https://example.com"] }]);
  });

  test("uses 'xdg-open' on linux", async () => {
    const calls: Array<{ cmd: string }> = [];
    const fakeSpawn = (cmd: string, args: string[]) => {
      calls.push({ cmd });
      return { unref() {} } as any;
    };
    await openUrl("https://x", { platform: "linux", spawn: fakeSpawn });
    expect(calls[0]?.cmd).toBe("xdg-open");
  });

  test("uses cmd /c start on win32", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { unref() {} } as any;
    };
    await openUrl("https://x", { platform: "win32", spawn: fakeSpawn });
    expect(calls[0]?.cmd).toBe("cmd");
    expect(calls[0]?.args.slice(0, 2)).toEqual(["/c", "start"]);
  });
});
