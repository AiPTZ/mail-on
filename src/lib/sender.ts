export function sanitizeFromLocal(value: string) {
  const local = value.trim().toLowerCase();
  if (!local || local.includes("@") || local.includes(" ") || /[^a-z0-9._+-]/.test(local)) {
    return null;
  }
  return local;
}

export function isValidReplyTo(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildFromEmail(local: string, domain: string) {
  return `${local}@${domain}`;
}
