import bcrypt from "bcryptjs";
import { signUserToken, verifyUserToken } from "./auth";
import { nid } from "./ids";
import { provisionDomain, verifyDomainRemote } from "./mailgun";
import { demoDns, emptyStats, findUserByEmail, readDb, writeDb } from "./store";
import type { SessionUser } from "./types";
import { enrollList, queueCampaign, tickWorker } from "./worker";
import { warmupCapForDay } from "./warmup";

export type ApiResult<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
};

function ok<T>(data: T, status = 200): ApiResult<T> {
  return { ok: true, status, data };
}

function fail(status: number, error: string): ApiResult {
  return { ok: false, status, error };
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || nid("ws")
  );
}

function sessionFromUser(user: {
  id: string;
  agencyId: string;
  workspaceId?: string;
  email: string;
  name: string;
  role: "agency" | "workspace";
}): SessionUser {
  return {
    id: user.id,
    agencyId: user.agencyId,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function login(input: { email: string; password: string }): Promise<ApiResult> {
  const user = findUserByEmail(input.email || "");
  if (!user || !bcrypt.compareSync(input.password || "", user.passwordHash)) {
    return fail(401, "invalid_credentials");
  }
  const session = sessionFromUser(user);
  const token = await signUserToken(session);
  return ok({ token, user: session });
}

export async function authenticate(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const apiKey = process.env.MAILON_API_KEY || "";
  if (apiKey && token === apiKey) {
    const db = readDb();
    const agency = db.agencies[0];
    const user = db.users.find((u) => u.role === "agency" && u.agencyId === agency?.id) || db.users.find((u) => u.role === "agency");
    if (!agency || !user) return null;
    return sessionFromUser(user);
  }
  return verifyUserToken(token);
}

function canAccessWorkspace(session: SessionUser, workspaceId: string) {
  if (session.role === "agency") {
    const ws = readDb().workspaces.find((w) => w.id === workspaceId);
    return Boolean(ws && ws.agencyId === session.agencyId);
  }
  return session.workspaceId === workspaceId;
}

function requireWorkspace(
  session: SessionUser,
  body?: Record<string, unknown>,
  hint?: string,
): ApiResult | { workspaceId: string } {
  if (session.role === "workspace" && session.workspaceId) return { workspaceId: session.workspaceId };
  const workspaceId = hint || String(body?.workspaceId || "");
  if (session.role === "agency" && workspaceId && canAccessWorkspace(session, workspaceId)) {
    return { workspaceId };
  }
  return fail(403, "workspace_required");
}

async function createWorkspace(session: SessionUser, body: Record<string, unknown>) {
  if (session.role !== "agency") return fail(403, "agency_only");
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "cliente123");
  const domainName = String(body.domain || "").trim().toLowerCase();
  const fromName = String(body.fromName || name).trim();
  const fromLocal = String(body.fromLocal || "ola").trim() || "ola";
  if (!name || !email || !domainName) return fail(400, "missing_fields");
  if (findUserByEmail(email)) return fail(409, "email_taken");

  let workspaceId = "";
  writeDb((db) => {
    const workspace = {
      id: nid("ws"),
      agencyId: session.agencyId,
      name,
      slug: slugify(name),
      createdAt: new Date().toISOString(),
    };
    workspaceId = workspace.id;
    db.workspaces.push(workspace);
    db.users.push({
      id: nid("usr"),
      agencyId: session.agencyId,
      workspaceId: workspace.id,
      email,
      name,
      role: "workspace",
      passwordHash: bcrypt.hashSync(password, 10),
    });
    db.domains.push({
      id: nid("dom"),
      workspaceId: workspace.id,
      domain: domainName,
      fromName,
      fromEmail: `${fromLocal}@${domainName}`,
      status: "pending",
      dnsRecords: demoDns(domainName),
      dailyCap: warmupCapForDay(1),
      sentToday: 0,
      sentTodayDate: new Date().toISOString().slice(0, 10),
      bounceRate: 0,
      complaintRate: 0,
      warmupDay: 1,
    });
  });

  try {
    const records = await provisionDomain(domainName);
    writeDb((db) => {
      const domain = db.domains.find((d) => d.workspaceId === workspaceId);
      if (domain) domain.dnsRecords = records;
    });
  } catch {
    /* demo DNS already stored */
  }

  const db = readDb();
  return ok(
    {
      workspace: db.workspaces.find((w) => w.id === workspaceId),
      domain: db.domains.find((d) => d.workspaceId === workspaceId),
    },
    201,
  );
}

async function verifyWorkspaceDomain(session: SessionUser, workspaceId: string) {
  if (session.role !== "agency") return fail(403, "agency_only");
  if (!canAccessWorkspace(session, workspaceId)) return fail(404, "not_found");
  const domain = readDb().domains.find((d) => d.workspaceId === workspaceId);
  if (!domain) return fail(404, "domain_not_found");
  const verified = await verifyDomainRemote(domain.domain);
  writeDb((db) => {
    const row = db.domains.find((d) => d.id === domain.id);
    if (!row) return;
    row.status = verified ? "verified" : "failed";
    if (verified) row.verifiedAt = new Date().toISOString();
  });
  return ok({ domain: readDb().domains.find((d) => d.id === domain.id) });
}

function workspaceHealth(session: SessionUser, workspaceId: string) {
  if (!canAccessWorkspace(session, workspaceId)) return fail(404, "not_found");
  const db = readDb();
  const workspace = db.workspaces.find((w) => w.id === workspaceId);
  const domain = db.domains.find((d) => d.workspaceId === workspaceId);
  if (!workspace || !domain) return fail(404, "not_found");
  return ok({
    health: {
      workspaceId,
      domain: domain.domain,
      fromEmail: domain.fromEmail,
      status: domain.status,
      dailyCap: domain.dailyCap,
      sentToday: domain.sentToday,
      warmupDay: domain.warmupDay,
      bounceRate: domain.bounceRate,
      complaintRate: domain.complaintRate,
      remainingToday: Math.max(0, domain.dailyCap - domain.sentToday),
    },
  });
}

function createList(session: SessionUser, body: Record<string, unknown>, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const name = String(body.name || "").trim();
  if (!name) return fail(400, "missing_fields");
  let listId = "";
  writeDb((db) => {
    const list = {
      id: nid("lst"),
      workspaceId: ws.workspaceId,
      name,
      createdAt: new Date().toISOString(),
    };
    listId = list.id;
    db.lists.push(list);
  });
  return ok({ list: readDb().lists.find((l) => l.id === listId) }, 201);
}

function importContacts(session: SessionUser, listId: string, body: Record<string, unknown>, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const db = readDb();
  const list = db.lists.find((l) => l.id === listId && l.workspaceId === ws.workspaceId);
  if (!list) return fail(404, "list_not_found");
  const incoming = Array.isArray(body.contacts) ? body.contacts : [];
  let imported = 0;
  let skipped = 0;
  writeDb((store) => {
    const inList = new Set(store.contacts.filter((c) => c.listId === listId).map((c) => c.email));
    const suppressed = new Set(
      store.contacts
        .filter((c) => c.workspaceId === ws.workspaceId && c.status === "suppressed")
        .map((c) => c.email),
    );
    for (const raw of incoming) {
      const row = (raw || {}) as Record<string, unknown>;
      const email = String(row.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped += 1;
        continue;
      }
      if (inList.has(email) || suppressed.has(email)) {
        skipped += 1;
        continue;
      }
      const tags = Array.isArray(row.tags)
        ? row.tags.map((t) => String(t))
        : String(row.tags || "")
            .split(/[|,;]/)
            .map((t) => t.trim())
            .filter(Boolean);
      store.contacts.push({
        id: nid("ct"),
        workspaceId: ws.workspaceId,
        listId,
        email,
        name: String(row.name || row.nome || "").trim(),
        tags,
        source: "crm",
        crmContactId: row.crmContactId ? String(row.crmContactId) : undefined,
        status: "active",
        createdAt: new Date().toISOString(),
      });
      inList.add(email);
      imported += 1;
    }
  });
  return ok({ imported, skipped, listId });
}

function saveTemplate(session: SessionUser, body: Record<string, unknown>, templateId?: string, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const name = String(body.name || "").trim();
  const html = String(body.html || "");
  if (!name || !html) return fail(400, "missing_fields");
  let id = templateId;
  writeDb((db) => {
    if (templateId) {
      const tpl = db.templates.find((t) => t.id === templateId && t.workspaceId === ws.workspaceId);
      if (tpl) {
        tpl.name = name;
        tpl.html = html;
        tpl.designJson = body.designJson ?? tpl.designJson;
        tpl.updatedAt = new Date().toISOString();
        id = tpl.id;
        return;
      }
    }
    const created = {
      id: nid("tpl"),
      workspaceId: ws.workspaceId,
      name,
      html,
      designJson: body.designJson ?? {},
      updatedAt: new Date().toISOString(),
    };
    db.templates.push(created);
    id = created.id;
  });
  return ok({ template: readDb().templates.find((t) => t.id === id) }, templateId ? 200 : 201);
}

async function createCampaign(session: SessionUser, body: Record<string, unknown>, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const name = String(body.name || "").trim();
  const subject = String(body.subject || "").trim();
  const listId = String(body.listId || "");
  const templateId = String(body.templateId || "");
  if (!name || !subject || !listId || !templateId) return fail(400, "missing_fields");
  const db = readDb();
  if (!db.lists.find((l) => l.id === listId && l.workspaceId === ws.workspaceId)) return fail(404, "list_not_found");
  if (!db.templates.find((t) => t.id === templateId && t.workspaceId === ws.workspaceId)) {
    return fail(404, "template_not_found");
  }
  let campaignId = "";
  writeDb((store) => {
    const campaign = {
      id: nid("cmp"),
      workspaceId: ws.workspaceId,
      listId,
      templateId,
      name,
      subject,
      previewText: String(body.previewText || ""),
      status: "draft" as const,
      scheduledAt: body.scheduledAt ? new Date(String(body.scheduledAt)).toISOString() : undefined,
      stats: emptyStats(),
    };
    store.campaigns.push(campaign);
    campaignId = campaign.id;
  });
  if (body.sendNow || body.scheduledAt) {
    queueCampaign(campaignId);
    await tickWorker();
  }
  return ok({ campaign: readDb().campaigns.find((c) => c.id === campaignId) }, 201);
}

async function sendCampaign(session: SessionUser, campaignId: string, hint?: string) {
  const ws = requireWorkspace(session, undefined, hint);
  if ("status" in ws) return ws;
  const campaign = readDb().campaigns.find((c) => c.id === campaignId && c.workspaceId === ws.workspaceId);
  if (!campaign) return fail(404, "not_found");
  queueCampaign(campaignId);
  await tickWorker();
  return ok({ campaign: readDb().campaigns.find((c) => c.id === campaignId) });
}

function createSequence(session: SessionUser, body: Record<string, unknown>, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const name = String(body.name || "").trim();
  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps = rawSteps
    .slice(0, 3)
    .map((step, index) => {
      const row = (step || {}) as Record<string, unknown>;
      const templateId = String(row.templateId || "");
      const subject = String(row.subject || "").trim();
      if (!templateId || !subject) return null;
      return {
        id: nid("stp"),
        order: index + 1,
        delayDays: Math.max(0, Number(row.delayDays || 0) || 0),
        templateId,
        subject,
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (!name || steps.length === 0) return fail(400, "missing_fields");
  let sequenceId = "";
  writeDb((db) => {
    const sequence = {
      id: nid("seq"),
      workspaceId: ws.workspaceId,
      name,
      status: "draft" as const,
      steps,
      createdAt: new Date().toISOString(),
    };
    db.sequences.push(sequence);
    sequenceId = sequence.id;
  });
  return ok({ sequence: readDb().sequences.find((s) => s.id === sequenceId) }, 201);
}

async function enrollSequence(session: SessionUser, sequenceId: string, body: Record<string, unknown>, hint?: string) {
  const ws = requireWorkspace(session, body, hint);
  if ("status" in ws) return ws;
  const sequence = readDb().sequences.find((s) => s.id === sequenceId && s.workspaceId === ws.workspaceId);
  if (!sequence) return fail(404, "not_found");
  const listId = String(body.listId || "");
  try {
    enrollList(sequenceId, listId);
    await tickWorker();
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "enroll_failed");
  }
  return ok({ sequence: readDb().sequences.find((s) => s.id === sequenceId) });
}

function publicUser(user: { id: string; email: string; name: string; role: string; workspaceId?: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId };
}

export async function handle(
  method: string,
  path: string,
  body: unknown,
  token: string | null,
  ctx?: { workspaceId?: string },
): Promise<ApiResult> {
  const verb = method.toUpperCase();
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const workspaceHint = ctx?.workspaceId;

  if (verb === "POST" && pathname === "/auth/login") {
    return login({ email: String(payload.email || ""), password: String(payload.password || "") });
  }

  const session = await authenticate(token);
  if (!session) return fail(401, "unauthenticated");

  const parts = pathname.split("/").filter(Boolean);

  if (verb === "GET" && pathname === "/me") {
    return ok({ user: publicUser(session) });
  }

  if (verb === "GET" && pathname === "/workspaces") {
    const db = readDb();
    const workspaces =
      session.role === "agency"
        ? db.workspaces.filter((w) => w.agencyId === session.agencyId)
        : db.workspaces.filter((w) => w.id === session.workspaceId);
    return ok({ workspaces });
  }

  if (verb === "POST" && pathname === "/workspaces") {
    return createWorkspace(session, payload);
  }

  if (parts[0] === "workspaces" && parts[1]) {
    const workspaceId = parts[1];
    if (verb === "GET" && parts[2] === "health" && !parts[3]) {
      return workspaceHealth(session, workspaceId);
    }
    if (verb === "POST" && parts[2] === "verify-domain" && !parts[3]) {
      return verifyWorkspaceDomain(session, workspaceId);
    }
    if (verb === "GET" && !parts[2]) {
      if (!canAccessWorkspace(session, workspaceId)) return fail(404, "not_found");
      const db = readDb();
      return ok({
        workspace: db.workspaces.find((w) => w.id === workspaceId),
        domain: db.domains.find((d) => d.workspaceId === workspaceId),
      });
    }
  }

  if (verb === "GET" && pathname === "/lists") {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) {
      if (session.role === "agency") {
        return ok({ lists: readDb().lists.filter((l) => readDb().workspaces.some((w) => w.id === l.workspaceId && w.agencyId === session.agencyId)) });
      }
      return ws;
    }
    return ok({ lists: readDb().lists.filter((l) => l.workspaceId === ws.workspaceId) });
  }

  if (verb === "POST" && pathname === "/lists") {
    return createList(session, payload, workspaceHint);
  }

  if (verb === "POST" && parts[0] === "lists" && parts[1] && parts[2] === "contacts") {
    return importContacts(session, parts[1], payload, workspaceHint);
  }

  if (verb === "GET" && pathname === "/contacts") {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    return ok({ contacts: readDb().contacts.filter((c) => c.workspaceId === ws.workspaceId) });
  }

  if (verb === "GET" && pathname === "/templates") {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    return ok({ templates: readDb().templates.filter((t) => t.workspaceId === ws.workspaceId) });
  }

  if (verb === "POST" && pathname === "/templates") {
    return saveTemplate(session, payload, undefined, workspaceHint);
  }

  if (parts[0] === "templates" && parts[1] && !parts[2]) {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    const template = readDb().templates.find((t) => t.id === parts[1] && t.workspaceId === ws.workspaceId);
    if (!template) return fail(404, "not_found");
    if (verb === "GET") return ok({ template });
    if (verb === "PUT" || verb === "PATCH") return saveTemplate(session, payload, parts[1], workspaceHint);
  }

  if (verb === "GET" && pathname === "/campaigns") {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    return ok({ campaigns: readDb().campaigns.filter((c) => c.workspaceId === ws.workspaceId) });
  }

  if (verb === "POST" && pathname === "/campaigns") {
    return createCampaign(session, payload, workspaceHint);
  }

  if (parts[0] === "campaigns" && parts[1]) {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    const campaign = readDb().campaigns.find((c) => c.id === parts[1] && c.workspaceId === ws.workspaceId);
    if (!campaign) return fail(404, "not_found");
    if (verb === "GET" && !parts[2]) return ok({ campaign });
    if (verb === "POST" && parts[2] === "send") return sendCampaign(session, parts[1], workspaceHint);
  }

  if (verb === "GET" && pathname === "/sequences") {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    return ok({ sequences: readDb().sequences.filter((s) => s.workspaceId === ws.workspaceId) });
  }

  if (verb === "POST" && pathname === "/sequences") {
    return createSequence(session, payload, workspaceHint);
  }

  if (parts[0] === "sequences" && parts[1]) {
    const ws = requireWorkspace(session, payload, workspaceHint);
    if ("status" in ws) return ws;
    const sequence = readDb().sequences.find((s) => s.id === parts[1] && s.workspaceId === ws.workspaceId);
    if (!sequence) return fail(404, "not_found");
    if (verb === "GET" && !parts[2]) return ok({ sequence });
    if (verb === "POST" && parts[2] === "enroll") return enrollSequence(session, parts[1], payload, workspaceHint);
  }

  if ((verb === "POST" || verb === "GET") && pathname === "/worker/tick") {
    const result = await tickWorker();
    return ok(result);
  }

  return fail(404, "not_found");
}
