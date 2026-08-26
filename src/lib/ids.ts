import { randomBytes } from "crypto";

export function nid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function todayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
