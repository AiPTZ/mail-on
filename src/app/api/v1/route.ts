import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "Mail ON API",
    version: "v1",
    docs: "/docs/API.md",
  });
}
