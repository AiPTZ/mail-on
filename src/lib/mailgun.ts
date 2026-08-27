import { demoDns } from "./store";
import type { DnsRecord } from "./types";

const API_KEY = process.env.MAILGUN_API_KEY || "";
const API_BASE = process.env.MAILGUN_API_BASE || "https://api.mailgun.net";

export function mailgunConfigured() {
  return Boolean(API_KEY);
}

async function mailgun(path: string, init?: RequestInit) {
  const auth = Buffer.from(`api:${API_KEY}`).toString("base64");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: init?.signal || AbortSignal.timeout(8000),
    headers: {
      Authorization: `Basic ${auth}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailgun ${res.status}: ${text}`);
  }
  return res.json();
}

export async function provisionDomain(domain: string): Promise<DnsRecord[]> {
  if (!mailgunConfigured()) return demoDns(domain);

  await mailgun("/v3/domains", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: domain,
      dkim_key_size: "2048",
      force_dkim_authority: "true",
    }),
  });

  const info = await mailgun(`/v3/domains/${domain}`);
  const sending = info.sending_dns_records || [];
  const receiving = info.receiving_dns_records || [];
  return [...sending, ...receiving].map((r: { record_type: string; name: string; value: string }) => ({
    type: r.record_type === "CNAME" ? "CNAME" : r.record_type === "MX" ? "MX" : "TXT",
    host: r.name,
    value: r.value,
    purpose: r.name.includes("domainkey")
      ? "dkim"
      : r.name.includes("_dmarc")
        ? "dmarc"
        : r.record_type === "CNAME"
          ? "tracking"
          : r.record_type === "MX"
            ? "mx"
            : "spf",
  }));
}

export async function verifyDomainRemote(domain: string): Promise<boolean> {
  if (!mailgunConfigured()) return true;
  const info = await mailgun(`/v3/domains/${domain}/verify`, { method: "PUT" });
  return info?.domain?.state === "active";
}

export async function sendMessage(input: {
  domain: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl: string;
  replyTo?: string;
  jobId?: string;
  campaignId?: string;
}): Promise<string> {
  if (!mailgunConfigured()) {
    return `demo_${Date.now()}`;
  }

  const body = new URLSearchParams({
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    "h:List-Unsubscribe": `<${input.unsubscribeUrl}>`,
    "h:List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "o:tracking": "yes",
    "o:tracking-opens": "yes",
    "o:tracking-clicks": "htmlonly",
  });
  if (input.replyTo) body.set("h:Reply-To", input.replyTo);
  if (input.jobId) body.set("v:jobId", input.jobId);
  if (input.campaignId) body.set("v:campaignId", input.campaignId);

  const result = await mailgun(`/v3/${input.domain}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return result.id || `mg_${Date.now()}`;
}

export type MailgunStoredEvent = {
  event: string;
  recipient: string;
  sender?: string;
  jobId?: string;
  campaignId?: string;
  severity?: string;
  reason?: string;
  description?: string;
};

export async function fetchDomainEvents(domain: string, begin: Date): Promise<MailgunStoredEvent[]> {
  if (!mailgunConfigured()) return [];
  const params = new URLSearchParams({
    begin: String(Math.floor(begin.getTime() / 1000)),
    ascending: "yes",
    limit: "300",
  });
  const payload = await mailgun(`/v3/${domain}/events?${params.toString()}`);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item: Record<string, unknown>) => {
    const userVars = (item["user-variables"] || {}) as Record<string, unknown>;
    const envelope = (item.envelope || {}) as Record<string, unknown>;
    const message = (item.message || {}) as Record<string, unknown>;
    const headers = (message.headers || {}) as Record<string, unknown>;
    const delivery = (item["delivery-status"] || {}) as Record<string, unknown>;
    return {
      event: String(item.event || ""),
      recipient: String(item.recipient || headers.to || ""),
      sender: envelope.sender ? String(envelope.sender) : undefined,
      jobId: userVars.jobId ? String(userVars.jobId) : undefined,
      campaignId: userVars.campaignId ? String(userVars.campaignId) : undefined,
      severity: item.severity ? String(item.severity) : undefined,
      reason: item.reason ? String(item.reason) : undefined,
      description: String(delivery.message || delivery.description || item["error"] || ""),
    };
  });
}
