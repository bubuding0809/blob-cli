import { timingSafeEqual } from "node:crypto";
import { signSession } from "@/lib/session.ts";
import { getViewerPassword, getViewerSessionSecret } from "@/lib/env.ts";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = form.get("password");
  if (typeof submitted !== "string") {
    return new Response("password required", { status: 400 });
  }
  const expected = getViewerPassword();
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("invalid", { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ exp }, getViewerSessionSecret());
  const cookie = `viewer_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": cookie },
  });
}
