import { describe, test, expect } from "bun:test";
import { signSession, verifySession } from "../lib/session.ts";

const SECRET = "test-secret-32-bytes-base64-padding==";

describe("session", () => {
  test("sign + verify round-trip", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ exp: future });
  });

  test("verify returns null on tampered payload", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    const [payload, sig] = token.split(".");
    const tampered = payload.replace(/.$/, "x") + "." + sig;
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  test("verify returns null on tampered signature", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    const tampered = token.replace(/.$/, "x");
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  test("verify returns null on wrong secret", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    expect(verifySession(token, "different-secret")).toBeNull();
  });

  test("verify returns null on missing token", () => {
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
  });

  test("verify returns null on malformed token", () => {
    expect(verifySession("no-dot-here", SECRET)).toBeNull();
    expect(verifySession("only.one.dot.too.many", SECRET)).toBeNull();
  });

  test("verify returns null when exp is in the past", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = signSession({ exp: past }, SECRET);
    expect(verifySession(token, SECRET)).toBeNull();
  });

  test("verify returns payload when exp is in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = signSession({ exp: future }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ exp: future });
  });
});
