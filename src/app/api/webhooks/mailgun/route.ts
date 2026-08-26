import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/store";
import { suppressContact } from "@/lib/worker";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let event = "";
  let recipient = "";
  let domain = "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    event = body["event-data"]?.event || body.event || "";
    recipient = body["event-data"]?.recipient || body.recipient || "";
    domain = body["event-data"]?.["sending-domain"] || body.domain || "";
  } else {
    const form = await request.formData();
    event = String(form.get("event") || "");
    recipient = String(form.get("recipient") || "");
    domain = String(form.get("domain") || "");
  }

  const workspace = readDb().domains.find((d) => d.domain === domain);
  if (!workspace || !recipient) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event === "bounced" || event === "failed") {
    suppressContact(workspace.workspaceId, recipient, "bounce");
  }
  if (event === "complained") {
    suppressContact(workspace.workspaceId, recipient, "complaint");
  }
  if (event === "unsubscribed") {
    suppressContact(workspace.workspaceId, recipient, "unsubscribe");
  }

  return NextResponse.json({ ok: true });
}
