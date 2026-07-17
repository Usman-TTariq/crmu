import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  clientIpFromHeaders,
  isAllowlistActive,
  isIpAllowed,
  parseAllowedIps,
} from "@/lib/ip-allowlist";

function deniedResponse(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Access denied</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: system-ui, sans-serif; background:#f7f8fa; color:#12151a; }
    .box { max-width:420px; padding:32px 28px; background:#fff; border:1px solid #e2e6eb;
      border-radius:14px; box-shadow:0 12px 34px rgba(46,4,10,0.12); text-align:center; }
    h1 { font-size:18px; margin:0 0 8px; }
    p { margin:0; font-size:14px; color:#5c6570; line-height:1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Access denied</h1>
    <p>This CRM is only available from the office network.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function proxy(request: NextRequest) {
  // Office IP allowlist — before auth so login is also blocked off-network.
  if (isAllowlistActive()) {
    const allowlist = parseAllowedIps(process.env.ALLOWED_IPS);
    const fallback =
      ("ip" in request && typeof (request as { ip?: string }).ip === "string"
        ? (request as { ip: string }).ip
        : null) || request.headers.get("x-vercel-forwarded-for");
    const ip = clientIpFromHeaders(request.headers, fallback);
    if (!isIpAllowed(ip, allowlist)) {
      return deniedResponse();
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verifies the JWT locally (cached signing keys) instead of a network call
  // to the auth server on every request; still refreshes expired sessions.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub || null;

  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
