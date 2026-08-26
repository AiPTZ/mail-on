# Mail ON Super-admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super-admin `arcanjo` gerencia usuarios, provisiona DNS, impersona workspaces, le erros/logs; webhook e API ficam autenticados.

**Architecture:** Papel `admin` acima de agency. Persistencia JSON ganha `User.status` e `audit[]`. JWT carrega `adminId`/`impersonating`. `/admin` e o painel; criar dominio e acesso vira `admin_only`. Webhook Mailgun valida HMAC. Worker legado some.

**Tech Stack:** Next.js 14 App Router, TypeScript, Server Actions, JWT jose, bcryptjs, JSON store, Mailgun HMAC.

## Global Constraints

- Visual LinkON: `--ink` `#0a0a0b`, `--gold-500` `#d4af37`, `--cream` `#f5f2ea`, Playfair + Inter, gold-frame.
- Nome do produto: Mail ON. Sem marca MonkeyCode no codigo.
- Login admin: `arcanjo` / `29172510` → `/admin`.
- So admin configura dominio e acessos. Cliente so informa email e dispara.
- Sem `verified`, nada sai. From sempre `@` sending domain.
- Sem exclusao fisica de usuario ou historico.
- Autor git: `AiPTZ <aiptz@users.noreply.github.com>`. Hooks path vazio no commit.
- Testes: `npm test` (`tsx src/lib/api-v1.test.ts`). Typecheck: `npm run typecheck`.
- Next 14: `params` nao e Promise. `next.config.mjs`.

## File map

- Modify: `src/lib/types.ts` — role admin, status, SessionUser, AuditEvent, Database.audit
- Modify: `src/lib/store.ts` — emptyDb.audit, migrate status, promover arcanjo a admin
- Modify: `src/lib/auth.ts` — role admin + impersonation no JWT
- Create: `src/lib/rate-limit.ts` — 5 login/min/IP
- Create: `src/lib/audit.ts` — `appendAudit(...)`
- Modify: `src/lib/api-v1.ts` — admin routes, admin_only DNS, API key como admin, worker POST
- Modify: `src/lib/api-v1.test.ts` — testes do spec
- Modify: `src/lib/actions.ts` — login admin, CRUD users, impersonate com adminId, agency sem create
- Modify: `src/middleware.ts` — proteger `/admin`
- Modify: `src/app/api/webhooks/mailgun/route.ts` — HMAC
- Delete behavior: `src/app/api/worker/tick/route.ts` — 404 autenticado (remover handlers)
- Create: `src/app/admin/**` — layout + pages
- Modify: `src/app/agency/**` — sem novo cliente / sem DNS write
- Modify: `src/app/app/layout.tsx` + `src/components/shell.tsx` — banner impersonate
- Modify: `docs/*` + `README.md`

---

### Task 1: Tipos, seed admin, auth JWT

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/lib/auth.ts`
- Test: `src/lib/api-v1.test.ts`

**Interfaces:**
- Produces: `UserRole = "admin" | "agency" | "workspace"`; `UserStatus = "active" | "disabled"`; `User.status`; `SessionUser.adminId?`; `SessionUser.impersonating?`; `AuditEvent`; `Database.audit: AuditEvent[]`; `verifyUserToken` devolve role admin.

- [ ] **Step 1: Estender o teste de login para exigir admin**

Em `src/lib/api-v1.test.ts`, no `emptyDb` seed incluir usuario admin e `status: "active"` em todos. Adicionar teste:

```ts
await test("arcanjo login is admin", async () => {
  const res = await api.login({ email: "arcanjo", password: "29172510" });
  assert(res.ok === true, "expected admin login");
  assert(res.data?.user.role === "admin", "expected admin role");
});
```

O seed do teste deve ter:

```ts
users: [
  { id: "usr_admin", agencyId: "ag_1", email: "arcanjo@mg.aiptz.com.br", name: "Arcanjo", role: "admin", status: "active", passwordHash: bcrypt.hashSync("29172510", 10) },
  { id: "usr_agency", agencyId: "ag_1", email: "xena.w@example.org", name: "Ops", role: "agency", status: "active", passwordHash: bcrypt.hashSync("mailon123", 10) },
],
audit: [],
```

Todos os users de fixture precisam de `status: "active"`.

- [ ] **Step 2: Rodar teste (falha ate types/auth/login)**

Run: `npm test`
Expected: falha em role admin ou login arcanjo.

- [ ] **Step 3: Types**

```ts
export type UserRole = "admin" | "agency" | "workspace";
export type UserStatus = "active" | "disabled";

export interface User {
  id: string;
  agencyId: string;
  workspaceId?: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  passwordHash: string;
}

export interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  workspaceId?: string;
  targetUserId?: string;
  meta?: Record<string, string>;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  agencyId: string;
  workspaceId?: string;
  email: string;
  name: string;
  role: UserRole;
  adminId?: string;
  impersonating?: boolean;
}

export interface Database {
  // existentes +
  audit: AuditEvent[];
}
```

- [ ] **Step 4: Store — emptyDb.audit, migrate, promover arcanjo**

`emptyDb()` inclui `audit: []`.

Apos parse, `normalizeDb(db)`:
- se `!db.audit` → `db.audit = []`
- cada user sem `status` → `status = "active"`
- user cujo email e `arcanjo` ou `arcanjo@mg.aiptz.com.br`: `role = "admin"`, `status = "active"`, senha permanece; **nao apagar** o workspace Arcanjo Sales tech
- persistir se mudou

`ensureArcanjo`: se o user existir, forcar `role: "admin"` e `status: "active"`. Se criar, criar como `admin` (pode manter `workspaceId` so como referencia; impersonate nao depende disso).

- [ ] **Step 5: Auth JWT**

`verifyUserToken` / `signUserToken` passam `adminId` e `impersonating`. Role:

```ts
role: payload.role === "admin" ? "admin" : payload.role === "agency" ? "agency" : "workspace",
```

- [ ] **Step 6: Commit**

```bash
git -c core.hooksPath=/tmp/opencode/empty-hooks -c user.name=AiPTZ -c user.email=aiptz@users.noreply.github.com add src/lib/types.ts src/lib/store.ts src/lib/auth.ts src/lib/api-v1.test.ts
git -c core.hooksPath=/tmp/opencode/empty-hooks -c user.name=AiPTZ -c user.email=aiptz@users.noreply.github.com commit -m "feat: papel admin, status e audit no store"
```

---

### Task 2: Rate limit, login disabled, API admin

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/audit.ts`
- Modify: `src/lib/api-v1.ts`
- Modify: `src/lib/api-v1.test.ts`

**Interfaces:**
- Consumes: `User.status`, `UserRole` admin, `Database.audit`
- Produces: `checkLoginRate(ip: string): boolean`; `appendAudit(db, event)`; rotas `/users`, `/jobs`, `/events`, `/audit`; `createWorkspace`/`verifyDomain` = `admin_only`; `authenticate(MAILON_API_KEY)` = primeiro admin; worker so POST.

- [ ] **Step 1: Testes**

```ts
await test("disabled user cannot login", async () => {
  writeDb((db) => { db.users[0].status = "disabled"; });
  const res = await api.login({ email: "arcanjo", password: "29172510" });
  assert(res.ok === false && res.status === 401, "disabled");
  writeDb((db) => { db.users[0].status = "active"; });
});

await test("agency cannot create workspace", async () => {
  const { data } = await api.login({ email: "xena.w@example.org", password: "mailon123" });
  const res = await api.handle("POST", "/workspaces", { name: "X", email: "x@x.com", password: "pw", domain: "mail.x.com" }, data!.token);
  assert(res.status === 403 && res.error === "admin_only", "agency blocked");
});

await test("workspace cannot create workspace", async () => {
  // criar via admin depois, ou seed um workspace user
});

await test("admin creates user and workspace", async () => {
  const { data } = await api.login({ email: "arcanjo", password: "29172510" });
  const userRes = await api.handle("POST", "/users", { name: "Cli", email: "cli@x.com", password: "pw", role: "workspace" }, data!.token);
  assert(userRes.ok, "create user");
  const ws = await api.handle("POST", "/workspaces", { name: "Cli Co", email: "ops@cli.com", password: "pw", domain: "mail.cli.com" }, data!.token);
  assert(ws.ok, "create workspace");
});

await test("admin lists jobs and audit", async () => {
  const { data } = await api.login({ email: "arcanjo", password: "29172510" });
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
```

Ajustar testes existentes que criam workspace com token agency: passar a logar como `arcanjo`.

- [ ] **Step 2: Rodar (falha)**

Run: `npm test`

- [ ] **Step 3: rate-limit.ts**

```ts
const hits = new Map<string, number[]>();
export function checkLoginRate(ip: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= limit) { hits.set(ip, prev); return false; }
  prev.push(now);
  hits.set(ip, prev);
  return true;
}
```

- [ ] **Step 4: audit.ts**

```ts
export function appendAudit(db: Database, input: Omit<AuditEvent, "id" | "createdAt">) {
  db.audit.push({ id: nid("aud"), createdAt: new Date().toISOString(), ...input });
}
```

- [ ] **Step 5: api-v1.ts**

- `sessionFromUser` inclui `status` check no `login`: se `user.status === "disabled"` → `fail(401, "disabled")`.
- `authenticate` API key: primeiro user `role === "admin"` (fallback agency so se nao houver admin).
- `canAccessWorkspace`: `admin` → true.
- `requireWorkspace`: admin com `workspaceId` hint ok.
- `createWorkspace` / `verifyWorkspaceDomain`: `if (session.role !== "admin") return fail(403, "admin_only")`.
- CRUD users (list/create/get/patch). Patch senha rehash. Nao permitir `status=disabled` se for o ultimo admin active.
- GET `/jobs`, `/events`, `/audit` admin_only, filtros no body/query via payload (`workspaceId`, `status`, `type`).
- Worker: so `POST /worker/tick`.
- Login rate: `handle` recebe `ip` opcional; route passa `x-forwarded-for` ou `127.0.0.1`. Sem ip nos testes unitarios = skip rate.

Route `src/app/api/v1/[...path]/route.ts`: passar IP para `handle`.

- [ ] **Step 6: npm test + commit**

```bash
git commit -m "feat: API admin, admin_only DNS e worker autenticado"
```

---

### Task 3: Webhook HMAC e remover tick legado

**Files:**
- Modify: `src/app/api/webhooks/mailgun/route.ts`
- Modify: `src/app/api/worker/tick/route.ts` (responder 404)
- Create: `src/lib/mailgun-webhook.ts` com `verifyMailgunSignature`
- Test: adicionar asserts no test file importando `verifyMailgunSignature`

```ts
export function verifyMailgunSignature(input: { timestamp: string; token: string; signature: string; key: string; now?: number }) {
  if (!input.key) return false;
  const ts = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const hmac = createHmac("sha256", input.key).update(input.timestamp + input.token).digest("hex");
  return hmac === input.signature;
}
```

Producao sem `MAILGUN_WEBHOOK_SIGNING_KEY` → 401. Dev sem chave: recusar tambem se `NODE_ENV=production`; em test/dev sem chave, recusar assinatura vazia (sempre 401 se key ausente) — spec: sem chave em producao 401; para nao deixar buraco, **sempre exigir chave se definida; se nao definida e NODE_ENV!==production, aceitar so se header `x-mailon-dev-webhook: 1`**. Mais simples e alinhado ao spec de protecao: **sempre 401 sem assinatura valida quando a key existe; quando a key nao existe, 401** (demo local de webhook usa a key do `.env`). Implementacao: se `!key` return 401 `invalid_signature`.

- [ ] **Step: commit** `fix: assinar webhook Mailgun e fechar worker legado`

---

### Task 4: Actions + middleware + UI /admin

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/middleware.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/users/new/page.tsx`
- Create: `src/app/admin/users/[id]/page.tsx`
- Create: `src/app/admin/workspaces/page.tsx`
- Create: `src/app/admin/workspaces/new/page.tsx`
- Create: `src/app/admin/workspaces/[id]/page.tsx`
- Create: `src/app/admin/logs/page.tsx`
- Modify: `src/components/shell.tsx` — nav admin + banner
- Modify: `src/app/app/layout.tsx` — permitir impersonating; banner Voltar
- Modify: `src/app/agency/layout.tsx` e pages — remover Novo cliente / verify / create
- Modify: `src/app/login/page.tsx` — hint arcanjo admin
- Modify: `src/app/agency/new/page.tsx` — redirect `/admin/workspaces/new` ou notFound para agency

**Actions**

```ts
loginAction → redirect admin ? "/admin" : agency ? "/agency" : "/app"
createWorkspaceAction → role === "admin"
verifyDomainAction → role === "admin"
createUserAction / updateUserAction → admin
impersonateWorkspace → admin; sessao { role:"workspace", workspaceId, adminId: session.id, impersonating:true, name: ws.name, email: wsUser?.email || session.email, id: wsUser?.id || session.id }
stopImpersonationAction → restaura user admin via adminId
processQueueAction → admin ou agency ou impersonating
```

Agency perde `createWorkspaceAction` e `verifyDomainAction`. Pagina `/agency/new` redireciona. `/agency/workspaces/:id` vira read-only (sem checar DNS, sem criar). Sem botao Operar na agency.

Middleware matcher: `/admin/:path*`. `role !== "admin"` (e nao impersonating) redireciona. Impersonating acessa `/app`, nao `/admin`.

Shell items admin:

```
/admin Visao geral
/admin/users Usuarios
/admin/workspaces Workspaces
/admin/logs Logs
```

CTA: Novo cliente → `/admin/workspaces/new`.

Banner impersonate no shell se `user.impersonating`.

Form novo workspace: nome, email, senha, dominio, fromName. Depois da criacao mostra tabela DNS (tipo, host, valor, uso) com texto: "Peca ao cliente para publicar estes registros. Disparo so depois de verificado."

Logs: query `?tab=jobs|audit|events`. Tabelas ink/gold.

- [ ] **Step: typecheck + commit** `feat: painel /admin LinkON com usuarios, DNS e logs`

---

### Task 5: Docs + regressao

**Files:**
- Modify: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/INTEGRATION.md`, `docs/README.md`, `README.md`

Cobrir: papel admin, onboarding (cliente so email), HMAC, worker sem GET, API key = admin, login arcanjo.

- [ ] **Step: `npm test` && `npm run typecheck`**
- [ ] **Step: commit** `docs: admin, webhook assinado e worker autenticado`

---

## Spec coverage

| Spec | Task |
|---|---|
| role admin + seed arcanjo | 1 |
| status disabled | 1–2 |
| audit | 1–2, 4 |
| CRUD users | 2, 4 |
| DNS so admin, lista CNAME/DKIM | 2, 4 |
| impersonate | 4 |
| /admin UI LinkON | 4 |
| HMAC webhook | 3 |
| worker legado fora | 3 |
| API key = admin | 2 |
| rate limit login | 2 |
| docs | 5 |
| testes listados no spec | 2–3 |

## Type names (locked)

`UserRole`, `UserStatus`, `AuditEvent`, `appendAudit`, `checkLoginRate`, `verifyMailgunSignature`, `admin_only`, `disabled`, `invalid_signature`, `rate_limited`.
