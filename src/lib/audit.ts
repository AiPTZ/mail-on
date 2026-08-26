import { nid } from "./ids";
import type { AuditEvent, Database } from "./types";

export function appendAudit(db: Database, input: Omit<AuditEvent, "id" | "createdAt">) {
  db.audit.push({
    id: nid("aud"),
    createdAt: new Date().toISOString(),
    ...input,
  });
}
