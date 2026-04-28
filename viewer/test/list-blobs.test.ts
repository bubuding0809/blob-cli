import { describe, test, expect } from "bun:test";
import { listBlobs } from "../lib/list-blobs.ts";

describe("listBlobs", () => {
  test("calls SDK list with token", async () => {
    let captured: any = null;
    await listBlobs({
      token: "secret",
      list: (async (params: any) => {
        captured = params;
        return { blobs: [], hasMore: false, cursor: undefined };
      }) as any,
    });
    expect(captured.token).toBe("secret");
  });

  test("returns blobs sorted by uploadedAt descending", async () => {
    const result = await listBlobs({
      token: "t",
      list: (async () => ({
        blobs: [
          { pathname: "a", size: 1, uploadedAt: new Date("2026-04-01") },
          { pathname: "b", size: 2, uploadedAt: new Date("2026-04-28") },
          { pathname: "c", size: 3, uploadedAt: new Date("2026-04-15") },
        ],
        hasMore: false,
        cursor: undefined,
      })) as any,
    });
    expect(result.map((b) => b.pathname)).toEqual(["b", "c", "a"]);
  });
});
