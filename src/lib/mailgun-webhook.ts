import { createHmac } from "crypto";

export function verifyMailgunSignature(input: {
  timestamp: string;
  token: string;
  signature: string;
  key: string;
  now?: number;
}) {
  if (!input.key || !input.timestamp || !input.token || !input.signature) return false;
  const ts = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const hmac = createHmac("sha256", input.key).update(input.timestamp + input.token).digest("hex");
  return hmac === input.signature;
}
