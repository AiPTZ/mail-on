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
  if (request.method === "GET" || request.method === "HEAD") {
    body = Object.fromEntries(request.nextUrl.searchParams.entries());
  } else {
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
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
  });
  const format = request.nextUrl.searchParams.get("format");
  if (format === "csv" && result.ok && result.data && "csv" in result.data) {
    const csv = String((result.data as { csv: string }).csv);
    const slug = path[1] || "campanha";
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-${slug}.csv"`,
      },
    });
  }
  if (format === "xlsx" && result.ok && result.data && "rows" in result.data && "campaign" in result.data) {
    const { buildCampaignWorkbook } = await import("@/lib/report-xlsx");
    const xlsx = buildCampaignWorkbook(result.data as never);
    const slug = path[1] || "campanha";
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="relatorio-atual-${slug}.xlsx"`,
      },
    });
  }
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
