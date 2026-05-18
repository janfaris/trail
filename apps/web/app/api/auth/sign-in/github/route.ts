import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// GET shim: lets <a href="/api/auth/sign-in/github"> trigger the OAuth flow
// (better-auth's canonical endpoint is POST /api/auth/sign-in/social)
export async function GET(req: NextRequest) {
  const callbackURL = req.nextUrl.searchParams.get("callbackURL") || "/";
  const result = await auth.api.signInSocial({
    body: { provider: "github", callbackURL },
    headers: req.headers,
    returnHeaders: true,
  });
  const url = (result as { response?: { url?: string }; url?: string }).response?.url
    ?? (result as { url?: string }).url;
  if (!url) {
    return NextResponse.json({ error: "no oauth url returned", result }, { status: 500 });
  }
  const res = NextResponse.redirect(url, 302);
  // forward any Set-Cookie headers from better-auth (state, pkce verifier)
  const headers = (result as { headers?: Headers }).headers;
  if (headers) {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const c of setCookies) res.headers.append("set-cookie", c);
  }
  return res;
}
