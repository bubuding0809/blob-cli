import { describe, test, expect } from "bun:test";
import { validateToken } from "../src/commands/init.ts";

describe("validateToken", () => {
  test("returns true when SDK list succeeds", async () => {
    const fakeList = async (_opts: any) => ({ blobs: [], hasMore: false, cursor: undefined } as any);
    expect(await validateToken("blob_rw_good", { list: fakeList })).toBe(true);
  });

  test("returns false on auth error", async () => {
    const fakeList = async () => {
      const e: any = new Error("Forbidden");
      e.status = 403;
      throw e;
    };
    expect(await validateToken("blob_rw_bad", { list: fakeList })).toBe(false);
  });

  test("returns false on 401", async () => {
    const fakeList = async () => {
      const e: any = new Error("Unauthorized");
      e.status = 401;
      throw e;
    };
    expect(await validateToken("blob_rw_bad", { list: fakeList })).toBe(false);
  });

  test("rethrows non-auth errors", async () => {
    const fakeList = async () => {
      throw new Error("network down");
    };
    await expect(validateToken("blob_rw", { list: fakeList })).rejects.toThrow(/network down/);
  });

  test("passes token to SDK", async () => {
    let captured: any = null;
    const fakeList = async (opts: any) => {
      captured = opts;
      return { blobs: [], hasMore: false, cursor: undefined } as any;
    };
    await validateToken("blob_rw_xyz", { list: fakeList });
    expect(captured.token).toBe("blob_rw_xyz");
    expect(captured.limit).toBe(1);
  });
});
