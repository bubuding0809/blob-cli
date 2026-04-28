import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { POST } from "../app/api/login/route.ts";

const ENV_VARS = {
  VIEWER_PASSWORD: "hunter2",
  VIEWER_SESSION_SECRET: "test-secret-32-bytes-base64-padding==",
};
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    VIEWER_PASSWORD: process.env.VIEWER_PASSWORD,
    VIEWER_SESSION_SECRET: process.env.VIEWER_SESSION_SECRET,
  };
  process.env.VIEWER_PASSWORD = ENV_VARS.VIEWER_PASSWORD;
  process.env.VIEWER_SESSION_SECRET = ENV_VARS.VIEWER_SESSION_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function makeRequest(body: URLSearchParams): Request {
  return new Request("https://v.example.com/api/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/login", () => {
  test("redirects to / on correct password and sets cookie", async () => {
    const res = await POST(makeRequest(new URLSearchParams({ password: "hunter2" })));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("viewer_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  test("returns 401 on wrong password", async () => {
    const res = await POST(makeRequest(new URLSearchParams({ password: "wrong" })));
    expect(res.status).toBe(401);
  });

  test("returns 400 when password field is missing", async () => {
    const res = await POST(makeRequest(new URLSearchParams({})));
    expect(res.status).toBe(400);
  });
});
