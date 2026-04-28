import { describe, test, expect } from "bun:test";
import { runDelete } from "../src/commands/delete.ts";

describe("runDelete", () => {
  test("calls SDK del with url and token, prints confirmation", async () => {
    let deletedArg: string | null = null;
    let printed = "";
    await runDelete(
      { urlOrPath: "https://x/y.html", json: false },
      {
        token: "t",
        del: (async (target: string, _opts: any) => {
          deletedArg = target;
        }) as any,
        printResult: (r, _o) => {
          printed = r.text;
        },
      },
    );
    expect(deletedArg as any).toBe("https://x/y.html");
    expect(printed).toBe("deleted: https://x/y.html");
  });

  test("--json mode emits structured output", async () => {
    let json: any = null;
    await runDelete(
      { urlOrPath: "x.html", json: true },
      {
        token: "t",
        del: (async () => {}) as any,
        printResult: (r, opts) => {
          if (opts.json) json = r.json;
        },
      },
    );
    expect(json).toEqual({ deleted: "x.html" });
  });
});
