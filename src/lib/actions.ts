"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { appendAudit } from "./audit";
import { createSession, destroySession, getSession } from "./auth";
import { parseContactFile } from "./csv";
import { nid } from "./ids";
import { provisionDomain, verifyDomainRemote } from "./mailgun";
import { demoDns, emptyStats, findUserByEmail, readDb, writeDb } from "./store";
import type { UserRole, UserStatus } from "./types";
import { enrollList, queueCampaign, tickWorker } from "./worker";
import { warmupCapForDay } from "./warmup";

function homeFor(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "agency") return "/agency";
  return "/app";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const user = findUserByEmail(email);
  if (!user || user.status === "disabled" || !bcrypt.compareSync(password, user.passwordHash)) {
    redirect("/login?error=1");
  }
  await createSession({
    id: user.id,
    agencyId: user.agencyId,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  writeDb((db) => appendAudit(db, { actorUserId: user.id, action: "login" }));
  redirect(homeFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createWorkspaceAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "cliente123");
  const domainName = String(formData.get("domain") || "").trim().toLowerCase();
  const fromName = String(formData.get("fromName") || name).trim();
  if (!name || !email || !domainName) redirect("/admin/workspaces/new?error=missing");

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  let workspaceId = "";
  writeDb((db) => {
    const workspace = {
      id: nid("ws"),
      agencyId: session.agencyId,
      name,
      slug: slug || nid("ws"),
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
    });
    db.domains.push({
      id: nid("dom"),
      workspaceId: workspace.id,
      domain: domainName,
      fromName,
      fromEmail: `ola@${domainName}`,
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
    // demo DNS already stored
  }

  redirect(`/admin/workspaces/${workspaceId}`);
}

export async function verifyDomainAction(workspaceId: string) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  writeDb((db) => {
    const domain = db.domains.find((d) => d.workspaceId === workspaceId);
    if (!domain) return;
    domain.status = "pending";
  });

  const db = (await import("./store")).readDb();
  const domain = db.domains.find((d) => d.workspaceId === workspaceId);
  if (!domain) return;

  const ok = await verifyDomainRemote(domain.domain);
  writeDb((store) => {
    const row = store.domains.find((d) => d.id === domain.id);
    if (!row) return;
    row.status = ok ? "verified" : "failed";
    if (ok) row.verifiedAt = new Date().toISOString();
    appendAudit(store, {
      actorUserId: session.id,
      action: "domain.verify",
      workspaceId,
      meta: { status: row.status },
    });
  });
  revalidatePath(`/admin/workspaces/${workspaceId}`);
  revalidatePath("/admin/workspaces");
  revalidatePath("/admin");
}

export async function updateFromAction(formData: FormData) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.impersonating)) redirect("/login");
  const workspaceId = session.workspaceId || String(formData.get("workspaceId") || "");
  const fromName = String(formData.get("fromName") || "").trim();
  const local = String(formData.get("fromLocal") || "ola").trim();
  writeDb((db) => {
    const domain = db.domains.find((d) => d.workspaceId === workspaceId);
    if (!domain) return;
    domain.fromName = fromName || domain.fromName;
    domain.fromEmail = `${local}@${domain.domain}`;
  });
  revalidatePath("/app");
}

export async function createListAction(formData: FormData) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  writeDb((db) => {
    db.lists.push({
      id: nid("lst"),
      workspaceId: session.workspaceId!,
      name,
      createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/app/audience");
}

export async function importCsvAction(formData: FormData) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  const listId = String(formData.get("listId") || "");
  const file = formData.get("file");
  if (!(file instanceof File) || !listId) return;
  const bytes = Buffer.from(await file.arrayBuffer());
  const rows = await parseContactFile(file.name, bytes);
  const source = /\.xlsx?$/i.test(file.name) ? "xlsx" : "csv";
  writeDb((db) => {
    const existing = new Set(
      db.contacts.filter((c) => c.listId === listId).map((c) => c.email),
    );
    for (const row of rows) {
      if (existing.has(row.email)) continue;
      existing.add(row.email);
      db.contacts.push({
        id: nid("ct"),
        workspaceId: session.workspaceId!,
        listId,
        email: row.email,
        name: row.name,
        tags: row.tags,
        source,
        status: "active",
        createdAt: new Date().toISOString(),
      });
    }
  });
  revalidatePath("/app/audience");
}

export async function saveTemplateAction(input: {
  id?: string;
  name: string;
  html: string;
  designJson: unknown;
}) {
  const session = await getSession();
  if (!session?.workspaceId) throw new Error("UNAUTHENTICATED");
  let id = input.id;
  writeDb((db) => {
    if (input.id) {
      const tpl = db.templates.find((t) => t.id === input.id && t.workspaceId === session.workspaceId);
      if (tpl) {
        tpl.name = input.name;
        tpl.html = input.html;
        tpl.designJson = input.designJson;
        tpl.updatedAt = new Date().toISOString();
        return;
      }
    }
    const created = {
      id: nid("tpl"),
      workspaceId: session.workspaceId!,
      name: input.name,
      html: input.html,
      designJson: input.designJson,
      updatedAt: new Date().toISOString(),
    };
    db.templates.push(created);
    id = created.id;
  });
  revalidatePath("/app/templates");
  return { id };
}

export async function createCampaignAction(formData: FormData) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const previewText = String(formData.get("previewText") || "").trim();
  const listId = String(formData.get("listId") || "");
  const templateId = String(formData.get("templateId") || "");
  const scheduledAt = String(formData.get("scheduledAt") || "");
  const sendNow = String(formData.get("sendNow") || "") === "1";
  if (!name || !subject || !listId || !templateId) redirect("/app/campaigns/new?error=1");

  let campaignId = "";
  writeDb((db) => {
    const campaign = {
      id: nid("cmp"),
      workspaceId: session.workspaceId!,
      listId,
      templateId,
      name,
      subject,
      previewText,
      status: "draft" as const,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      stats: emptyStats(),
    };
    db.campaigns.push(campaign);
    campaignId = campaign.id;
  });

  if (sendNow || scheduledAt) {
    queueCampaign(campaignId);
    await tickWorker();
  }
  redirect(`/app/campaigns/${campaignId}`);
}

export async function sendCampaignAction(campaignId: string) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  queueCampaign(campaignId);
  await tickWorker();
  revalidatePath(`/app/campaigns/${campaignId}`);
}

export async function createSequenceAction(formData: FormData) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  const steps = [1, 2, 3]
    .map((order) => {
      const templateId = String(formData.get(`step${order}Template`) || "");
      const subject = String(formData.get(`step${order}Subject`) || "").trim();
      const delayDays = Number(formData.get(`step${order}Delay`) || 0);
      if (!templateId || !subject) return null;
      return {
        id: nid("stp"),
        order,
        delayDays: Number.isFinite(delayDays) ? Math.max(0, delayDays) : 0,
        templateId,
        subject,
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!name || steps.length === 0) redirect("/app/sequences/new?error=1");

  let sequenceId = "";
  writeDb((db) => {
    const sequence = {
      id: nid("seq"),
      workspaceId: session.workspaceId!,
      name,
      status: "draft" as const,
      steps,
      createdAt: new Date().toISOString(),
    };
    db.sequences.push(sequence);
    sequenceId = sequence.id;
  });
  redirect(`/app/sequences/${sequenceId}`);
}

export async function startSequenceAction(formData: FormData) {
  const session = await getSession();
  if (!session?.workspaceId) redirect("/login");
  const sequenceId = String(formData.get("sequenceId") || "");
  const listId = String(formData.get("listId") || "");
  enrollList(sequenceId, listId);
  await tickWorker();
  revalidatePath(`/app/sequences/${sequenceId}`);
}

export async function processQueueAction() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "agency" && !session.impersonating) redirect("/login");
  await tickWorker();
  writeDb((db) => appendAudit(db, { actorUserId: session.adminId || session.id, action: "worker.tick" }));
  revalidatePath(session.role === "admin" ? "/admin" : session.role === "agency" ? "/agency" : "/app");
}

export async function impersonateWorkspace(workspaceId: string) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  const db = readDb();
  const workspace = db.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) redirect("/admin/workspaces");
  const user = db.users.find((u) => u.workspaceId === workspaceId && u.role === "workspace" && u.status !== "disabled");
  await createSession({
    id: user?.id || session.id,
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
    email: user?.email || session.email,
    name: workspace.name,
    role: "workspace",
    adminId: session.id,
    impersonating: true,
  });
  writeDb((store) =>
    appendAudit(store, {
      actorUserId: session.id,
      action: "impersonate.start",
      workspaceId,
      targetUserId: user?.id,
    }),
  );
  redirect("/app");
}

export async function stopImpersonationAction() {
  const session = await getSession();
  if (!session?.impersonating || !session.adminId) redirect("/login");
  const admin = readDb().users.find((u) => u.id === session.adminId && u.role === "admin");
  if (!admin || admin.status === "disabled") {
    await destroySession();
    redirect("/login");
  }
  writeDb((db) =>
    appendAudit(db, {
      actorUserId: admin.id,
      action: "impersonate.stop",
      workspaceId: session.workspaceId,
    }),
  );
  await createSession({
    id: admin.id,
    agencyId: admin.agencyId,
    workspaceId: admin.workspaceId,
    email: admin.email,
    name: admin.name,
    role: "admin",
  });
  redirect("/admin");
}

export async function createUserAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = (String(formData.get("role") || "workspace") as UserRole);
  const workspaceId = String(formData.get("workspaceId") || "") || undefined;
  if (!name || !email || !password) redirect("/admin/users/new?error=missing");
  if (findUserByEmail(email)) redirect("/admin/users/new?error=taken");
  writeDb((db) => {
    const user = {
      id: nid("usr"),
      agencyId: session.agencyId || db.agencies[0]?.id || "",
      workspaceId: role === "workspace" ? workspaceId : undefined,
      email,
      name,
      role: (role === "admin" || role === "agency" ? role : "workspace") as UserRole,
      status: "active" as UserStatus,
      passwordHash: bcrypt.hashSync(password, 10),
    };
    db.users.push(user);
    appendAudit(db, { actorUserId: session.id, action: "user.create", targetUserId: user.id });
  });
  redirect("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  const userId = String(formData.get("userId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "") as UserRole;
  const workspaceId = String(formData.get("workspaceId") || "") || undefined;
  const status = String(formData.get("status") || "active") as UserStatus;
  writeDb((db) => {
    const row = db.users.find((u) => u.id === userId);
    if (!row) return;
    if (status === "disabled" && row.role === "admin") {
      const others = db.users.filter((u) => u.role === "admin" && u.status !== "disabled" && u.id !== userId);
      if (others.length === 0) return;
    }
    if (name) row.name = name;
    if (email) row.email = email;
    if (password) row.passwordHash = bcrypt.hashSync(password, 10);
    if (role === "admin" || role === "agency" || role === "workspace") row.role = role;
    row.workspaceId = row.role === "workspace" ? workspaceId : undefined;
    if (status === "active" || status === "disabled") row.status = status;
    appendAudit(db, {
      actorUserId: session.id,
      action: status === "disabled" ? "user.disable" : "user.update",
      targetUserId: row.id,
    });
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
