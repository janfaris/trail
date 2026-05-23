import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Placeholder digest-subscribe endpoint.
// TODO(pr3): forward to Resend / Loops / ConvertKit (whatever we pick),
// dedupe on email, double opt-in, etc. For now we just validate shape and
// log so the /learn UX works end-to-end during PR2.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: unknown }).email ?? "").trim()
      : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  // eslint-disable-next-line no-console
  console.log("[digest-subscribe] placeholder accept", { email });
  return NextResponse.json({ ok: true });
}
