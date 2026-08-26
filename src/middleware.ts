import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mailon_session";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "mail-on-dev-secret-change-me");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = pathname.startsWith("/agency") || pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret());
    const role = payload.role;
    const impersonating = payload.impersonating === true;

    if (pathname.startsWith("/admin") && role !== "admin") {
      if (impersonating) return NextResponse.redirect(new URL("/app", request.url));
      return NextResponse.redirect(new URL(role === "agency" ? "/agency" : "/app", request.url));
    }
    if (pathname.startsWith("/agency") && role !== "agency") {
      return NextResponse.redirect(new URL(role === "admin" ? "/admin" : "/app", request.url));
    }
    if (pathname.startsWith("/app") && role !== "workspace" && !impersonating) {
      return NextResponse.redirect(new URL(role === "admin" ? "/admin" : "/agency", request.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/agency/:path*", "/app/:path*", "/admin/:path*"],
};
