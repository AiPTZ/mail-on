import { NextRequest, NextResponse } from "next/server";
import { handle, type ApiResult } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

function tokenFrom(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey.trim();
  return request.cookies.get("mailon_session")?.value || null;
}

function json(result: ApiResult) {
  const body = result.ok ? { ok: true, ...result.data } : { ok: false, error: result.error };
  return NextResponse.json(body, { status: result.status });
}

async function run(request: NextRequest, path: string[]) {
  let body: unknown = {};
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }
  }
  const result = await handle(request.method, `/${path.join("/")}`, body, tokenFrom(request), {
    workspaceId: request.headers.get("x-workspace-id") || undefined,
  });
  return json(result);
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return run(request, context.params.path);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return run(request, context.params.path);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  return run(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: { params: { path: string[] } }) {
  return run(request, context.params.path);
}
