import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import type { Database } from "./types";
import { replaceDb } from "./store";
import type { ApiResult } from "./api-v1";

const DATA = join("/tmp/mailon", "mailon-api-test.json");
process.env.MAILON_DATA_PATH = DATA;
process.env.MAILON_SKIP_SEED = "1";
process.env.AUTH_SECRET = "test-secret-mailon-api";
process.env.MAILON_API_KEY = "partner-key-test";

mkdirSync("/tmp/mailon", { recursive: true });

function emptyDb(): Database {
  return {
    agencies: [{ id: "ag_1", name: "Mail ON Agency", slug: "mailon" }],
    users: [
      {
        id: "usr_admin",
        agencyId: "ag_1",
        email: "arcanjo@mg.aiptz.com.br",
        name: "Arcanjo",
        role: "admin",
        status: "active",
        passwordHash: bcrypt.hashSync("29172510", 10),
      },
      {
        id: "usr_agency",
        agencyId: "ag_1",
        email: "xena.w@example.org",
        name: "Ops",
        role: "agency",
        status: "active",
        passwordHash: bcrypt.hashSync("mailon123", 10),
      },
    ],
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
  };
}

async function loadApi() {
  return import("./api-v1");
}

async function reset() {
  writeFileSync(DATA, JSON.stringify(emptyDb(), null, 2));
  replaceDb(emptyDb());
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function tokenOf(res: ApiResult): string {
  const token = (res.data as { token?: string } | undefined)?.token;
  assert(token, "missing token");
  return token;
}

async function run() {
  const api = await loadApi();
  let failed = 0;
  let passed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    await reset();
    try {
      await fn();
      passed += 1;
      console.log("ok", name);
    } catch (error) {
      failed += 1;
      console.error("fail", name, error instanceof Error ? error.message : error);
    }
  }

  await test("login rejects bad password", async () => {
    const res = await api.login({ email: "xena.w@example.org", password: "wrong" });
    assert(res.ok === false && res.status === 401, "expected 401");
  });

  await test("login returns bearer token", async () => {
    const res = await api.login({ email: "xena.w@example.org", password: "mailon123" });
    assert(res.ok === true, "expected login ok");
    assert(res.data?.token && res.data.user.role === "agency", "expected token + agency user");
  });

  await test("arcanjo login is admin", async () => {
    const res = await api.login({ email: "arcanjo", password: "29172510" });
    assert(res.ok === true, "expected admin login");
    assert(res.data?.user.role === "admin", "expected admin role");
    const me = await api.handle("GET", "/me", {}, tokenOf(res));
    assert(me.ok, me.error);
    assert((me.data as { user: { role: string } }).user.role === "admin", "jwt must keep admin");
  });

  await test("unauthenticated request is 401", async () => {
    const res = await api.handle("GET", "/workspaces", {}, null);
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  await test("agency cannot create workspace", async () => {
    const { data } = await api.login({ email: "xena.w@example.org", password: "mailon123" });
    const res = await api.handle(
      "POST",
      "/workspaces",
      { name: "X", email: "x@x.com", password: "pw", domain: "mail.x.com" },
      data!.token,
    );
    assert(res.status === 403 && res.error === "admin_only", "agency blocked");
  });

  await test("admin creates workspace with pending domain", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const res = await api.handle(
      "POST",
      "/workspaces",
      {
        name: "Cliente X",
        email: "cliente@x.com",
        password: "secret123",
        domain: "mail.clientex.com",
        fromName: "Cliente X",
      },
      data!.token,
    );
    assert(res.ok, `create workspace failed ${res.error}`);
    assert(res.data?.workspace.name === "Cliente X", "workspace name");
    assert(res.data?.domain.domain === "mail.clientex.com", "domain");
    assert(res.data?.domain.status === "pending", "pending until verify");
    assert(res.data?.domain.fromEmail.endsWith("@mail.clientex.com"), "from locked to sending domain");
  });

  await test("workspace cannot create another workspace", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const created = await api.handle(
      "POST",
      "/workspaces",
      { name: "A", email: "a@a.com", password: "pw", domain: "mail.a.com" },
      data!.token,
    );
    const wsLogin = await api.login({ email: "a@a.com", password: "pw" });
    const res = await api.handle(
      "POST",
      "/workspaces",
      { name: "B", email: "b@b.com", password: "pw", domain: "mail.b.com" },
      wsLogin.data!.token,
    );
    assert(res.status === 403 && res.error === "admin_only", `expected 403 admin_only got ${res.status} ${res.error}`);
    void created;
  });

  await test("campaign is blocked when domain is not verified", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const ws = await api.handle(
      "POST",
      "/workspaces",
      { name: "A", email: "a@a.com", password: "pw", domain: "mail.a.com" },
      data!.token,
    );
    const token = (await api.login({ email: "a@a.com", password: "pw" })).data!.token;
    const list = await api.handle("POST", "/lists", { name: "VIP" }, token);
    await api.handle(
      "POST",
      `/lists/${list.data!.list.id}/contacts`,
      { contacts: [{ email: "ana@x.com", name: "Ana" }] },
      token,
    );
    const tpl = await api.handle(
      "POST",
      "/templates",
      { name: "T", html: "<p>oi {{unsubscribe_url}}</p>", designJson: {} },
      token,
    );
    const camp = await api.handle(
      "POST",
      "/campaigns",
      {
        name: "Blast",
        subject: "Oi",
        listId: list.data!.list.id,
        templateId: tpl.data!.template.id,
        sendNow: true,
      },
      token,
    );
    assert(camp.ok, camp.error);
    assert(camp.data?.campaign.status === "blocked", `expected blocked got ${camp.data?.campaign.status}`);
    void ws;
  });

  await test("does not reactivate suppressed contact on import", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    await api.handle(
      "POST",
      "/workspaces",
      { name: "A", email: "a@a.com", password: "pw", domain: "mail.a.com" },
      data!.token,
    );
    const token = (await api.login({ email: "a@a.com", password: "pw" })).data!.token;
    const list = await api.handle("POST", "/lists", { name: "VIP" }, token);
    const listId = list.data!.list.id;
    await api.handle(
      "POST",
      `/lists/${listId}/contacts`,
      { contacts: [{ email: "ana@x.com", name: "Ana", crmContactId: "crm_1" }] },
      token,
    );
    const { suppressContact } = await import("./worker");
    const { readDb } = await import("./store");
    const workspaceId = readDb().workspaces[0].id;
    suppressContact(workspaceId, "ana@x.com", "bounce");
    const again = await api.handle(
      "POST",
      `/lists/${listId}/contacts`,
      { contacts: [{ email: "ana@x.com", name: "Ana 2" }] },
      token,
    );
    assert(again.ok, again.error);
    const contacts = (await api.handle("GET", "/contacts", {}, token)).data!.contacts;
    const ana = contacts.find((c: { email: string }) => c.email === "ana@x.com");
    assert(ana.status === "suppressed", `expected suppressed got ${ana.status}`);
    assert(ana.crmContactId === "crm_1", "crm id kept");
  });

  await test("api key authenticates as admin", async () => {
    const res = await api.handle("GET", "/workspaces", {}, "partner-key-test");
    assert(res.ok, res.error);
    assert(Array.isArray((res.data as { workspaces: unknown[] })?.workspaces), "workspaces list");
    const me = await api.handle("GET", "/me", {}, "partner-key-test");
    assert((me.data as { user: { role: string } }).user.role === "admin", "api key is admin");
  });

  await test("admin api key can act on a workspace via workspaceId", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const ws = await api.handle(
      "POST",
      "/workspaces",
      { name: "A", email: "a@a.com", password: "pw", domain: "mail.a.com" },
      (data as { token: string }).token,
    );
    const workspaceId = (ws.data as { workspace: { id: string } }).workspace.id;
    const list = await api.handle(
      "POST",
      "/lists",
      { name: "CRM", workspaceId },
      "partner-key-test",
    );
    assert(list.ok, list.error);
    assert((list.data as { list: { workspaceId: string } }).list.workspaceId === workspaceId, "list scoped to workspace");
  });

  await test("health returns warmup cap", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const ws = await api.handle(
      "POST",
      "/workspaces",
      { name: "A", email: "a@a.com", password: "pw", domain: "mail.a.com" },
      data!.token,
    );
    const token = (await api.login({ email: "a@a.com", password: "pw" })).data!.token;
    const health = await api.handle("GET", `/workspaces/${ws.data!.workspace.id}/health`, {}, token);
    assert(health.ok, health.error);
    assert(health.data?.health.dailyCap === 50, `day1 cap expected 50 got ${health.data?.health.dailyCap}`);
    assert(health.data?.health.status === "pending", "pending");
  });

  await test("disabled user cannot login", async () => {
    const { writeDb } = await import("./store");
    writeDb((db) => {
      const admin = db.users.find((u) => u.email.startsWith("arcanjo"));
      if (admin) admin.status = "disabled";
    });
    const res = await api.login({ email: "arcanjo", password: "29172510" });
    assert(res.ok === false && res.status === 401, "disabled");
  });

  await test("admin creates user and lists jobs and audit", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const userRes = await api.handle(
      "POST",
      "/users",
      { name: "Cli", email: "cli@x.com", password: "pw", role: "workspace" },
      data!.token,
    );
    assert(userRes.ok, `create user ${userRes.error}`);
    const jobs = await api.handle("GET", "/jobs", {}, data!.token);
    const audit = await api.handle("GET", "/audit", {}, data!.token);
    assert(jobs.ok && audit.ok, "lists");
  });

  await test("worker tick without token is 401", async () => {
    const res = await api.handle("POST", "/worker/tick", {}, null);
    assert(res.status === 401, "unauthenticated");
  });

  await test("worker GET tick is 404", async () => {
    const { data } = await api.login({ email: "arcanjo", password: "29172510" });
    const res = await api.handle("GET", "/worker/tick", {}, data!.token);
    assert(res.status === 404, "no get");
  });

  await test("mailgun signature rejects missing or stale hmac", async () => {
    const { verifyMailgunSignature } = await import("./mailgun-webhook");
    assert(verifyMailgunSignature({ timestamp: "1", token: "t", signature: "x", key: "k" }) === false, "bad hmac");
    const now = Math.floor(Date.now() / 1000);
    assert(
      verifyMailgunSignature({ timestamp: String(now - 400), token: "t", signature: "x", key: "k", now }) === false,
      "stale",
    );
    const { createHmac } = await import("crypto");
    const ts = String(now);
    const signature = createHmac("sha256", "secret").update(ts + "tok").digest("hex");
    assert(verifyMailgunSignature({ timestamp: ts, token: "tok", signature, key: "secret", now }) === true, "valid");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run();
