import { NextRequest, NextResponse } from "next/server";
import { verifyMailgunSignature } from "@/lib/mailgun-webhook";
import { readDb } from "@/lib/store";
import { ingestMailgunEvent } from "@/lib/worker";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function varsOf(source: unknown): Record<string, string> {
  if (!source || typeof source !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
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
  let jobId = "";
  let campaignId = "";
  let sender = "";
  let severity = "";
  let reason = "";
  let description = "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const data = body["event-data"] || body;
    event = data?.event || body.event || "";
    recipient = data?.recipient || body.recipient || "";
    domain = data?.["sending-domain"] || data?.domain || body.domain || "";
    timestamp = String(body.signature?.timestamp || body.timestamp || "");
    token = String(body.signature?.token || body.token || "");
    signature = String(body.signature?.signature || body.signature || "");
    const userVars = varsOf(data?.["user-variables"] || data?.userVariables);
    jobId = userVars.jobId || "";
    campaignId = userVars.campaignId || "";
    sender = String(data?.envelope?.sender || data?.sender || body.sender || "");
    severity = String(data?.severity || body.severity || "");
    reason = String(data?.reason || body.reason || "");
    const delivery = data?.["delivery-status"] || {};
    description = String(delivery.message || delivery.description || data?.error || "");
  } else {
    const form = await request.formData();
    event = String(form.get("event") || form.get("event-data") || "");
    recipient = String(form.get("recipient") || "");
    domain = String(form.get("domain") || "");
    timestamp = String(form.get("timestamp") || "");
    token = String(form.get("token") || "");
    signature = String(form.get("signature") || "");
    jobId = String(form.get("jobId") || form.get("v:jobId") || "");
    campaignId = String(form.get("campaignId") || form.get("v:campaignId") || "");
    sender = String(form.get("sender") || form.get("from") || "");
    severity = String(form.get("severity") || "");
    reason = String(form.get("reason") || "");
    description = String(form.get("error") || form.get("description") || "");
  }

  if (!verifyMailgunSignature({ timestamp, token, signature, key })) {
    return fail(401, "invalid_signature");
  }

  const db = readDb();
  const sending = db.domains.find((d) => d.domain === domain);
  const campaign = campaignId ? db.campaigns.find((c) => c.id === campaignId) : undefined;
  const workspaceId = sending?.workspaceId || campaign?.workspaceId;
  if (!workspaceId || !recipient) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  ingestMailgunEvent({
    event,
    recipient,
    sender: sender || undefined,
    workspaceId,
    jobId: jobId || undefined,
    campaignId: campaignId || undefined,
    severity: severity || undefined,
    reason: reason || undefined,
    description: description || undefined,
  });

  return NextResponse.json({ ok: true });
}
