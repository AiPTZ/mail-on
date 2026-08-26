const hits = new Map<string, number[]>();

export function checkLoginRate(ip: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= limit) {
    hits.set(ip, prev);
    return false;
  }
  prev.push(now);
  hits.set(ip, prev);
  return true;
}
