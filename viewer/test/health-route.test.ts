import { describe, test, expect } from "bun:test";
import { GET } from "../app/api/health/route.ts";

describe("GET /api/health", () => {
  test("returns 200 with { ok: true }", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("includes a version field", async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.version).toBe("string");
  });
});
