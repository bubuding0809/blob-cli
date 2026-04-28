import { describe, test, expect } from "bun:test";
import { validateViewer } from "../src/commands/init.ts";

describe("validateViewer", () => {
  test("returns true when /api/health responds 200 with { ok: true }", async () => {
    const fakeFetch = async (url: string) => {
      expect(url).toBe("https://v.example.com/api/health");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(true);
  });

  test("returns false on non-200", async () => {
    const fakeFetch = async () => new Response("nope", { status: 500 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("returns false on 200 with malformed JSON", async () => {
    const fakeFetch = async () => new Response("{not json", { status: 200 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("returns false when ok !== true", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ ok: false }), { status: 200 });
    expect(await validateViewer("https://v.example.com", { fetch: fakeFetch as any })).toBe(false);
  });

  test("strips trailing slash before composing URL", async () => {
    let captured = "";
    const fakeFetch = async (url: string) => {
      captured = url;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await validateViewer("https://v.example.com/", { fetch: fakeFetch as any });
    expect(captured).toBe("https://v.example.com/api/health");
  });

  test("rethrows network errors", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      validateViewer("https://v.example.com", { fetch: fakeFetch as any }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
