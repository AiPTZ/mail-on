import { NextRequest, NextResponse } from "next/server";
import { verifyMailgunSignature } from "@/lib/mailgun-webhook";
import { readDb } from "@/lib/store";
import { suppressContact } from "@/lib/worker";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "";
  if (!key) return fail(401, "invalid_signature");

  const contentType = request.headers.get("content-type") || "";
  let event = "";
  let recipient = "";
  let domain = "";
  let timestamp = "";
  let token = "";
  let signature = "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    event = body["event-data"]?.event || body.event || "";
    recipient = body["event-data"]?.recipient || body.recipient || "";
    domain = body["event-data"]?.["sending-domain"] || body.domain || "";
    timestamp = String(body.signature?.timestamp || body.timestamp || "");
    token = String(body.signature?.token || body.token || "");
    signature = String(body.signature?.signature || body.signature || "");
  } else {
    const form = await request.formData();
    event = String(form.get("event") || "");
    recipient = String(form.get("recipient") || "");
    domain = String(form.get("domain") || "");
    timestamp = String(form.get("timestamp") || "");
    token = String(form.get("token") || "");
    signature = String(form.get("signature") || "");
  }

  if (!verifyMailgunSignature({ timestamp, token, signature, key })) {
    return fail(401, "invalid_signature");
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
