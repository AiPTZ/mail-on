import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import type {
  Agency,
  AuditEvent,
  Campaign,
  Contact,
  ContactList,
  Database,
  Enrollment,
  MailEvent,
  SendJob,
  SendingDomain,
  Sequence,
  Template,
  User,
  UserRole,
  Workspace,
} from "./types";
import { nid, todayStamp } from "./ids";
import { warmupCapForDay } from "./warmup";

function dataPath() {
  return process.env.MAILON_DATA_PATH || join(process.cwd(), "data", "mailon.json");
}

const emptyDb = (): Database => ({
  agencies: [],
  users: [],
  workspaces: [],
  domains: [],
  lists: [],
  contacts: [],
  templates: [],
  campaigns: [],
  sequences: [],
  enrollments: [],
    jobs: [],
    events: [],
    audit: [],
  });

function isArcanjoEmail(email: string) {
  const value = email.toLowerCase();
  return value === "arcanjo@mg.aiptz.com.br" || value === "arcanjo" || value.split("@")[0] === "arcanjo";
}

function normalizeDb(db: Database) {
  let changed = false;
  if (!Array.isArray(db.audit)) {
    db.audit = [];
    changed = true;
  }
  for (const user of db.users) {
    if (!user.status) {
      user.status = "active";
      changed = true;
    }
    if (isArcanjoEmail(user.email) && user.role !== "admin") {
      user.role = "admin";
      user.status = "active";
      changed = true;
    }
  }
  for (const campaign of db.campaigns) {
    if (typeof campaign.stats.replied !== "number") {
      campaign.stats.replied = 0;
      changed = true;
    }
  }
  return changed;
}

function ensureArcanjo(db: Database) {
  if (process.env.MAILON_SKIP_SEED === "1") return false;
  const agency = db.agencies[0];
  if (!agency) return false;
  const existing = db.users.find((u) => isArcanjoEmail(u.email));
  if (existing) {
    let changed = false;
    if (existing.role !== "admin") {
      existing.role = "admin";
      changed = true;
    }
    if (existing.status !== "active") {
      existing.status = "active";
      changed = true;
    }
    const domain = db.domains.find((d) => d.workspaceId === existing.workspaceId && d.domain === "mg.aiptz.com.br");
    if (domain && domain.status !== "verified") {
      domain.status = "verified";
      domain.fromName = "Arcanjo Sales tech";
      domain.fromEmail = "arcanjo@mg.aiptz.com.br";
      domain.verifiedAt = new Date().toISOString();
      changed = true;
    }
    return changed;
  }

  const workspace: Workspace = {
    id: nid("ws"),
    agencyId: agency.id,
    name: "Arcanjo Sales tech",
    slug: "arcanjo-sales-tech",
    createdAt: new Date().toISOString(),
  };

  db.workspaces.push(workspace);
  db.users.push({
    id: nid("usr"),
    agencyId: agency.id,
    workspaceId: workspace.id,
    email: "arcanjo@mg.aiptz.com.br",
    name: "Arcanjo",
    role: "admin",
    status: "active",
    passwordHash: bcrypt.hashSync("29172510", 10),
  });
  db.domains.push({
    id: nid("dom"),
    workspaceId: workspace.id,
    domain: "mg.aiptz.com.br",
    fromName: "Arcanjo Sales tech",
    fromEmail: "arcanjo@mg.aiptz.com.br",
    status: "verified",
    dnsRecords: demoDns("mg.aiptz.com.br"),
    dailyCap: warmupCapForDay(1),
    sentToday: 0,
    sentTodayDate: todayStamp(),
    bounceRate: 0,
    complaintRate: 0,
    warmupDay: 1,
    verifiedAt: new Date().toISOString(),
  });
  db.lists.push({
    id: nid("lst"),
    workspaceId: workspace.id,
    name: "Teste",
    createdAt: new Date().toISOString(),
  });
  return true;
}

function ensureSeed(db: Database): Database {
  if (db.agencies.length > 0) {
    ensureArcanjo(db);
    return db;
  }

  const agency: Agency = { id: nid("ag"), name: "Mail ON Agency", slug: "mailon" };
  const agencyUser: User = {
    id: nid("usr"),
    agencyId: agency.id,
    email: "xena.w@example.org",
    name: "Operacao Mail ON",
    role: "agency",
    status: "active",
    passwordHash: bcrypt.hashSync("mailon123", 10),
  };

  const workspace: Workspace = {
    id: nid("ws"),
    agencyId: agency.id,
    name: "Atelier Aurora",
    slug: "atelier-aurora",
    createdAt: new Date().toISOString(),
  };

  const clientUser: User = {
    id: nid("usr"),
    agencyId: agency.id,
    workspaceId: workspace.id,
    email: "olivia.t@example.org",
    name: "Marina Aurora",
    role: "workspace",
    status: "active",
    passwordHash: bcrypt.hashSync("aurora123", 10),
  };

  const domain: SendingDomain = {
    id: nid("dom"),
    workspaceId: workspace.id,
    domain: "mail.atelieraurora.com",
    fromName: "Atelier Aurora",
    fromEmail: "ola@mail.atelieraurora.com",
    status: "verified",
    dnsRecords: demoDns("mail.atelieraurora.com"),
    dailyCap: warmupCapForDay(16),
    sentToday: 12,
    sentTodayDate: todayStamp(),
    bounceRate: 0.004,
    complaintRate: 0.0001,
    warmupDay: 16,
    verifiedAt: new Date().toISOString(),
  };

  const list: ContactList = {
    id: nid("lst"),
    workspaceId: workspace.id,
    name: "Clientes VIP",
    createdAt: new Date().toISOString(),
  };

  const contacts: Contact[] = [
    ["ana@example.com", "Ana Costa"],
    ["bruno@example.com", "Bruno Lima"],
    ["carla@example.com", "Carla Nunes"],
    ["diego@example.com", "Diego Alves"],
    ["elena@example.com", "Elena Prado"],
  ].map(([email, name]) => ({
    id: nid("ct"),
    workspaceId: workspace.id,
    listId: list.id,
    email,
    name,
    tags: ["vip"],
    source: "csv" as const,
    status: "active" as const,
    createdAt: new Date().toISOString(),
  }));

  const template: Template = {
    id: nid("tpl"),
    workspaceId: workspace.id,
    name: "Lancamento outono",
    designJson: { body: { rows: [] } },
    html: defaultTemplateHtml(
      "Pecas novas no Atelier",
      "A colecao de outono chegou. Tecidos nobres, corte sob medida.",
      "Ver colecao",
    ),
    updatedAt: new Date().toISOString(),
  };

  db.agencies.push(agency);
  db.users.push(agencyUser, clientUser);
  db.workspaces.push(workspace);
  db.domains.push(domain);
  db.lists.push(list);
  db.contacts.push(...contacts);
  db.templates.push(template);
  ensureArcanjo(db);
  return db;
}

export function demoDns(domain: string) {
  return [
    {
      type: "TXT" as const,
      host: domain,
      value: "v=spf1 include:mailgun.org ~all",
      purpose: "spf" as const,
    },
    {
      type: "TXT" as const,
      host: `pic._domainkey.${domain}`,
      value: "k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
      purpose: "dkim" as const,
    },
    {
      type: "TXT" as const,
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      purpose: "dmarc" as const,
    },
    {
      type: "CNAME" as const,
      host: `email.${domain}`,
      value: "mailgun.org",
      purpose: "tracking" as const,
    },
  ];
}

export function defaultTemplateHtml(title: string, body: string, cta: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0B0B0B;font-family:Georgia,serif;color:#F5E6C8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0B;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #C9A227;padding:40px;">
            <tr><td style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#C9A227;">Mail ON</td></tr>
            <tr><td style="padding-top:20px;font-size:28px;line-height:1.25;color:#F5E6C8;">${escapeHtml(title)}</td></tr>
            <tr><td style="padding-top:16px;font-size:16px;line-height:1.6;color:#D9C89A;">${escapeHtml(body)}</td></tr>
            <tr>
              <td style="padding-top:28px;">
                <a href="https://example.com" style="display:inline-block;background:#C9A227;color:#0B0B0B;text-decoration:none;padding:12px 22px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(cta)}</a>
              </td>
            </tr>
            <tr><td style="padding-top:36px;font-size:12px;color:#8A7A52;">Voce recebeu este email porque e cliente. <a href="{{unsubscribe_url}}" style="color:#C9A227;">Descadastrar</a></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function load(): Database {
  try {
    if (!existsSync(dataPath())) {
      const seeded = ensureSeed(emptyDb());
      persist(seeded);
      return seeded;
    }
    const raw = readFileSync(dataPath(), "utf8");
    const parsed = JSON.parse(raw) as Database;
    const beforeUsers = parsed.users.length;
    const next = ensureSeed(parsed);
    const migrated = normalizeDb(next);
    if (next.users.length !== beforeUsers || migrated) persist(next);
    return next;
  } catch {
    const seeded = ensureSeed(emptyDb());
    persist(seeded);
    return seeded;
  }
}

function persist(db: Database) {
  mkdirSync(dirname(dataPath()), { recursive: true });
  writeFileSync(dataPath(), JSON.stringify(db, null, 2));
}

export function replaceDb(next: Database) {
  persist(next);
  return next;
}

export function readDb(): Database {
  return load();
}

export function writeDb(mutator: (db: Database) => void): Database {
  const db = load();
  mutator(db);
  persist(db);
  return db;
}

export function findUserByEmail(email: string) {
  const q = email.trim().toLowerCase();
  return readDb().users.find((u) => {
    const stored = u.email.toLowerCase();
    return stored === q || stored.split("@")[0] === q;
  });
}

export function getWorkspace(id: string) {
  return readDb().workspaces.find((w) => w.id === id);
}

export function workspaceDomain(workspaceId: string) {
  return readDb().domains.find((d) => d.workspaceId === workspaceId);
}

export function workspaceLists(workspaceId: string) {
  return readDb().lists.filter((l) => l.workspaceId === workspaceId);
}

export function listContacts(listId: string) {
  return readDb().contacts.filter((c) => c.listId === listId);
}

export function emptyStats() {
  return {
    queued: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
    replied: 0,
  };
}

export type {
  Agency,
  AuditEvent,
  Campaign,
  Contact,
  ContactList,
  Enrollment,
  MailEvent,
  SendJob,
  SendingDomain,
  Sequence,
  Template,
  User,
  UserRole,
  Workspace,
};
