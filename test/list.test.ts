import { describe, test, expect } from "bun:test";
import { runList } from "../src/commands/list.ts";

const fakeBlobs = [
  {
    url: "https://x/a.html",
    pathname: "a.html",
    size: 100,
    uploadedAt: new Date("2026-04-28T10:00:00Z"),
  },
  {
    url: "https://x/b.html",
    pathname: "b.html",
    size: 200,
    uploadedAt: new Date("2026-04-28T11:00:00Z"),
  },
];

describe("runList", () => {
  test("passes prefix and limit to SDK", async () => {
    let captured: any = null;
    await runList(
      { prefix: "reports/", limit: 50, json: false },
      {
        token: "t",
        list: async (params) => {
          captured = params;
          return { blobs: [], hasMore: false, cursor: undefined } as any;
        },
        printResult: () => {},
      },
    );
    expect(captured.prefix).toBe("reports/");
    expect(captured.limit).toBe(50);
    expect(captured.token).toBe("t");
  });

  test("human output is tab-separated, one line per blob", async () => {
    let printed = "";
    await runList(
      { limit: 100, json: false },
      {
        token: "t",
        list: async () => ({ blobs: fakeBlobs, hasMore: false, cursor: undefined } as any),
        printResult: (r, _o) => {
          printed = r.text;
        },
      },
    );
    expect(printed).toBe(
      "2026-04-28T10:00:00.000Z\t100\thttps://x/a.html\n" +
        "2026-04-28T11:00:00.000Z\t200\thttps://x/b.html",
    );
  });

  test("json output exposes the blob array", async () => {
    let printedJson: any = null;
    await runList(
      { limit: 100, json: true },
      {
        token: "t",
        list: async () => ({ blobs: fakeBlobs, hasMore: false, cursor: undefined } as any),
        printResult: (r, opts) => {
          if (opts.json) printedJson = r.json;
        },
      },
    );
    expect(printedJson.blobs).toHaveLength(2);
    expect(printedJson.blobs[0].pathname).toBe("a.html");
  });
});
