import bcrypt from "bcryptjs";
import { appendAudit } from "./audit";
import { signUserToken, verifyUserToken } from "./auth";
import { nid } from "./ids";
import { provisionDomain, verifyDomainRemote } from "./mailgun";
import { checkLoginRate } from "./rate-limit";
import { demoDns, emptyStats, findUserByEmail, readDb, writeDb } from "./store";
import type { SessionUser, UserRole, UserStatus } from "./types";
import { buildFromEmail, isValidReplyTo, sanitizeFromLocal } from "./sender";
import { buildCampaignReport, enrollList, queueCampaign, syncCampaignEvents, tickWorker } from "./worker";
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
  role: UserRole;
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

export async function login(input: { email: string; password: string; ip?: string }): Promise<ApiResult> {
  if (input.ip && !checkLoginRate(input.ip)) return fail(429, "rate_limited");
  const user = findUserByEmail(input.email || "");
  if (!user || !bcrypt.compareSync(input.password || "", user.passwordHash)) {
    return fail(401, "invalid_credentials");
  }
  if (user.status === "disabled") return fail(401, "disabled");
  const session = sessionFromUser(user);
  const token = await signUserToken(session);
  writeDb((db) => appendAudit(db, { actorUserId: user.id, action: "login" }));
  return ok({ token, user: session });
}

export async function authenticate(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const apiKey = process.env.MAILON_API_KEY || "";
  if (apiKey && token === apiKey) {
    const db = readDb();
    const user =
      db.users.find((u) => u.role === "admin" && u.status !== "disabled") ||
      db.users.find((u) => u.role === "agency");
    if (!user) return null;
    return sessionFromUser(user);
  }
  return verifyUserToken(token);
}

function canAccessWorkspace(session: SessionUser, workspaceId: string) {
  if (session.role === "admin") return true;
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
  if ((session.role === "admin" || session.role === "agency") && workspaceId && canAccessWorkspace(session, workspaceId)) {
    return { workspaceId };
  }
  return fail(403, "workspace_required");
}

function requireAdmin(session: SessionUser) {
  if (session.role !== "admin") return fail(403, "admin_only");
  return null;
}

async function createWorkspace(session: SessionUser, body: Record<string, unknown>) {
  if (session.role !== "admin") return fail(403, "admin_only");
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
      status: "active",
      passwordHash: bcrypt.hashSync(password, 10),
    });
    appendAudit(db, {
      actorUserId: session.id,
      action: "domain.provision",
      workspaceId: workspace.id,
      targetUserId: db.users[db.users.length - 1]?.id,
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
  if (session.role !== "admin") return fail(403, "admin_only");
  if (!canAccessWorkspace(session, workspaceId)) return fail(404, "not_found");
  const domain = readDb().domains.find((d) => d.workspaceId === workspaceId);
  if (!domain) return fail(404, "domain_not_found");
  const verified = await verifyDomainRemote(domain.domain);
  writeDb((db) => {
    const row = db.domains.find((d) => d.id === domain.id);
    if (!row) return;
    row.status = verified ? "verified" : "failed";
    if (verified) row.verifiedAt = new Date().toISOString();
    appendAudit(db, {
      actorUserId: session.id,
      action: "domain.verify",
      workspaceId,
      meta: { status: row.status },
    });
  });
  return ok({ domain: readDb().domains.find((d) => d.id === domain.id) });
}

function updateSender(session: SessionUser, workspaceId: string, body: Record<string, unknown>) {
  if (!canAccessWorkspace(session, workspaceId)) return fail(404, "not_found");
  if (session.role !== "workspace" && session.role !== "admin" && !session.impersonating) {
    return fail(403, "workspace_required");
  }
  const domain = readDb().domains.find((d) => d.workspaceId === workspaceId);
  if (!domain) return fail(404, "domain_not_found");

  const fromName = body.fromName !== undefined ? String(body.fromName || "").trim() : undefined;
  const fromLocalRaw = body.fromLocal !== undefined ? String(body.fromLocal || "") : undefined;
  const replyRaw = body.replyTo !== undefined ? String(body.replyTo || "").trim() : undefined;

  if (fromLocalRaw !== undefined) {
    const local = sanitizeFromLocal(fromLocalRaw);
    if (!local) return fail(400, "from_locked_to_domain");
  }
  if (replyRaw !== undefined && replyRaw !== "" && !isValidReplyTo(replyRaw)) {
    return fail(400, "invalid_reply_to");
  }

  writeDb((db) => {
    const row = db.domains.find((d) => d.id === domain.id);
    if (!row) return;
    if (fromName) row.fromName = fromName;
    if (fromLocalRaw !== undefined) {
      const local = sanitizeFromLocal(fromLocalRaw);
      if (local) row.fromEmail = buildFromEmail(local, row.domain);
    }
    if (replyRaw !== undefined) row.replyTo = replyRaw || undefined;
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
      replyTo: domain.replyTo || "",
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
  const contactIds = Array.isArray(body.contactIds)
    ? [...new Set(body.contactIds.map((id) => String(id)).filter(Boolean))]
    : undefined;
  let campaignId = "";
  writeDb((store) => {
    const campaign = {
      id: nid("cmp"),
      workspaceId: ws.workspaceId,
      listId,
      contactIds,
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

function publicUser(user: { id: string; email: string; name: string; role: string; workspaceId?: string; status?: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: user.workspaceId,
    status: user.status || "active",
  };
}

function parseRole(value: unknown): UserRole | null {
  if (value === "admin" || value === "agency" || value === "workspace") return value;
  return null;
}

function listUsers(session: SessionUser) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  return ok({ users: readDb().users.map(publicUser) });
}

function createUser(session: SessionUser, body: Record<string, unknown>) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = parseRole(body.role) || "workspace";
  const workspaceId = body.workspaceId ? String(body.workspaceId) : undefined;
  const status: UserStatus = body.status === "disabled" ? "disabled" : "active";
  if (!name || !email || !password) return fail(400, "missing_fields");
  if (findUserByEmail(email)) return fail(409, "email_taken");
  if (role === "workspace" && workspaceId && !readDb().workspaces.find((w) => w.id === workspaceId)) {
    return fail(404, "not_found");
  }
  let userId = "";
  writeDb((db) => {
    const user = {
      id: nid("usr"),
      agencyId: session.agencyId || db.agencies[0]?.id || "",
      workspaceId: role === "workspace" ? workspaceId : undefined,
      email,
      name,
      role,
      status,
      passwordHash: bcrypt.hashSync(password, 10),
    };
    userId = user.id;
    db.users.push(user);
    appendAudit(db, { actorUserId: session.id, action: "user.create", targetUserId: user.id });
  });
  return ok({ user: publicUser(readDb().users.find((u) => u.id === userId)!) }, 201);
}

function getUser(session: SessionUser, userId: string) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const user = readDb().users.find((u) => u.id === userId);
  if (!user) return fail(404, "not_found");
  return ok({ user: publicUser(user) });
}

function updateUser(session: SessionUser, userId: string, body: Record<string, unknown>) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return fail(404, "not_found");
  if (body.status === "disabled" && user.role === "admin") {
    const activeAdmins = db.users.filter((u) => u.role === "admin" && u.status !== "disabled" && u.id !== userId);
    if (activeAdmins.length === 0) return fail(400, "last_admin");
  }
  writeDb((store) => {
    const row = store.users.find((u) => u.id === userId);
    if (!row) return;
    if (body.name) row.name = String(body.name).trim();
    if (body.email) row.email = String(body.email).trim().toLowerCase();
    if (body.password) row.passwordHash = bcrypt.hashSync(String(body.password), 10);
    if (body.role) {
      const role = parseRole(body.role);
      if (role) row.role = role;
    }
    if (body.workspaceId !== undefined) {
      row.workspaceId = body.workspaceId ? String(body.workspaceId) : undefined;
    }
    if (body.status === "active" || body.status === "disabled") row.status = body.status;
    appendAudit(store, {
      actorUserId: session.id,
      action: body.status === "disabled" ? "user.disable" : "user.update",
      targetUserId: row.id,
    });
  });
  return ok({ user: publicUser(readDb().users.find((u) => u.id === userId)!) });
}

function listJobs(session: SessionUser, body: Record<string, unknown>, hint?: string) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const workspaceId = hint || String(body.workspaceId || "");
  const status = String(body.status || "");
  const type = String(body.type || "");
  let jobs = readDb().jobs;
  if (workspaceId) jobs = jobs.filter((j) => j.workspaceId === workspaceId);
  if (status) jobs = jobs.filter((j) => j.status === status);
  if (type) jobs = jobs.filter((j) => j.type === type);
  return ok({ jobs });
}

function listEvents(session: SessionUser, body: Record<string, unknown>, hint?: string) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const workspaceId = hint || String(body.workspaceId || "");
  const type = String(body.type || "");
  let events = readDb().events;
  if (workspaceId) events = events.filter((e) => e.workspaceId === workspaceId);
  if (type) events = events.filter((e) => e.type === type);
  return ok({ events });
}

function listAudit(session: SessionUser) {
  const denied = requireAdmin(session);
  if (denied) return denied;
  return ok({ audit: readDb().audit });
}

export async function handle(
  method: string,
  path: string,
  body: unknown,
  token: string | null,
  ctx?: { workspaceId?: string; ip?: string },
): Promise<ApiResult> {
  const verb = method.toUpperCase();
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const workspaceHint = ctx?.workspaceId;

  if (verb === "POST" && pathname === "/auth/login") {
    return login({
      email: String(payload.email || ""),
      password: String(payload.password || ""),
      ip: ctx?.ip,
    });
  }

  const session = await authenticate(token);
  if (!session) return fail(401, "unauthenticated");

  const parts = pathname.split("/").filter(Boolean);

  if (verb === "GET" && pathname === "/me") {
    return ok({ user: publicUser(session) });
  }

  if (verb === "GET" && pathname === "/users") return listUsers(session);
  if (verb === "POST" && pathname === "/users") return createUser(session, payload);
  if (parts[0] === "users" && parts[1] && !parts[2]) {
    if (verb === "GET") return getUser(session, parts[1]);
    if (verb === "PATCH" || verb === "PUT") return updateUser(session, parts[1], payload);
  }

  if (verb === "GET" && pathname === "/jobs") return listJobs(session, payload, workspaceHint);
  if (verb === "GET" && pathname === "/events") return listEvents(session, payload, workspaceHint);
  if (verb === "GET" && pathname === "/audit") return listAudit(session);

  if (verb === "GET" && pathname === "/workspaces") {
    const db = readDb();
    const workspaces =
      session.role === "admin"
        ? db.workspaces
        : session.role === "agency"
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
    if ((verb === "PATCH" || verb === "PUT") && parts[2] === "sender" && !parts[3]) {
      return updateSender(session, workspaceId, payload);
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
    if (verb === "GET" && !parts[2]) {
      await syncCampaignEvents(campaign.id);
      return ok({ campaign: readDb().campaigns.find((c) => c.id === campaign.id) });
    }
    if (verb === "GET" && parts[2] === "report") {
      await syncCampaignEvents(campaign.id);
      const report = buildCampaignReport(campaign.id);
      if (!report) return fail(404, "not_found");
      return ok({ campaign: report.campaign, stats: report.stats, rows: report.rows, csv: report.csv });
    }
    if (verb === "POST" && parts[2] === "refresh") {
      await syncCampaignEvents(campaign.id);
      const report = buildCampaignReport(campaign.id);
      return ok({ campaign: report?.campaign, stats: report?.stats, rows: report?.rows });
    }
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

  if (verb === "POST" && pathname === "/worker/tick") {
    if (session.role !== "admin" && session.role !== "agency") return fail(403, "admin_only");
    const result = await tickWorker();
    writeDb((db) => appendAudit(db, { actorUserId: session.id, action: "worker.tick" }));
    return ok(result);
  }

  return fail(404, "not_found");
}
