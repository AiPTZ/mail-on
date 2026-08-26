import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "./types";

const COOKIE = "mailon_session";

function secret() {
  const value = process.env.AUTH_SECRET || "mail-on-dev-secret-change-me";
  return new TextEncoder().encode(value);
}

export async function signUserToken(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
}

export async function verifyUserToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      agencyId: String(payload.agencyId),
      workspaceId: payload.workspaceId ? String(payload.workspaceId) : undefined,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role === "agency" ? "agency" : "workspace",
    };
  } catch {
    return null;
  }
}

export async function createSession(user: SessionUser) {
  const token = await signUserToken(user);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifyUserToken(token);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}
