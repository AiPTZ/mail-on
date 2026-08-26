import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mailon_session";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "mail-on-dev-secret-change-me");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = pathname.startsWith("/agency") || pathname.startsWith("/app");
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret());
    if (pathname.startsWith("/agency") && payload.role !== "agency") {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    if (pathname.startsWith("/app") && payload.role !== "workspace") {
      return NextResponse.redirect(new URL("/agency", request.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/agency/:path*", "/app/:path*"],
};
