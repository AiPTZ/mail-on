# Mail ON — Super-admin, usuarios e logs

**Date:** 2026-08-26
**Product:** Mail ON
**Type:** Platform admin panel (LinkON visual)

## Problem

O operador da plataforma (`arcanjo`) e hoje um usuario `workspace`. Nao consegue criar/editar acessos, provisionar DNS para o cliente, disparar em nome de qualquer workspace nem ver falhas da fila. A agencia ainda provisiona dominio e senha. Webhook Mailgun e `/api/worker/tick` legado aceitam request sem assinatura/auth.

## Solution

Novo papel `admin` acima da agencia. Painel `/admin` no visual LinkON (ink/gold, Playfair + Inter, gold-frame). So o admin configura dominio e acessos. O cliente informa o email e dispara no dominio ja autenticado. Admin impersona o workspace para operar o `/app`. Jobs, eventos Mailgun e acoes do admin aparecem em `/admin/logs`. Endpoints e webhook passam a exigir auth/assinatura.

## Roles

| Role | Entra em | Pode | Nao pode |
|---|---|---|---|
| `admin` | `/admin` | CRUD de usuarios, criar workspace + sending domain, listar DNS (SPF/DKIM/DMARC/CNAME/MX), verificar DNS, impersonar qualquer workspace, processar fila, ler jobs/erros/audit | Apagar historico de envio; desativar o ultimo admin |
| `agency` | `/agency` | Ver workspaces e saude da propria agencia | Criar dominio, criar/editar acesso, ver logs globais |
| `workspace` | `/app` | Importar lista, Unlayer, campanha, sequencia, relatorio do proprio workspace | Ver DNS, editar From/dominio, criar usuario, ver `/admin` |

Login `arcanjo` / `29172510` autentica o unico seed `admin` e redireciona para `/admin`. Username sem `@` continua valido.

## Tenancy

```
Admin (plataforma)
  └── Agency
        └── Workspace (cliente)
              ├── SendingDomain (1:1, so admin provisiona/verifica)
              ├── Users role=workspace (so admin cria/edita/desativa)
              ├── Lists / Contacts / Templates / Campaigns / Sequences
              └── Jobs / Events
```

`User.status` = `active` | `disabled`. Desativado nao autentica (UI nem API). Sem exclusao fisica.

## Onboarding (so admin)

1. Admin em `/admin/users` ou `/admin/workspaces/new` cria o cliente: nome, email de login, senha inicial, subdominio de envio (`mail.cliente.com`), nome do From.
2. Mailgun (ou `demoDns` sem chave) gera os registros. Tela `/admin/workspaces/:id` lista o que o cliente cola no DNS:
   - SPF — TXT no host do sending domain
   - DKIM — TXT em `pic._domainkey.<domain>`
   - DMARC — TXT em `_dmarc.<domain>`
   - Tracking — CNAME `email.<domain>`
   - MX — se o Mailgun devolver
3. Admin clica "Checar DNS". Status vai para `verified` ou `failed`. Sem `verified`, nada sai.
4. Cliente recebe so o email/senha. No `/app` nao ha tela de DNS, From ou usuarios.

`POST /api/v1/workspaces` e `POST /api/v1/workspaces/:id/verify-domain` passam a ser `admin_only` (antes `agency_only`).

## Impersonacao

- Em qualquer workspace: "Operar" troca a sessao para o usuario `workspace` daquele cliente, guardando `adminId` + `impersonating: true` no JWT.
- Banner no `/app`: "Operando como {cliente} · Voltar ao admin".
- Acoes no `/app` usam `workspaceId` do cliente. Audit grava `actorUserId` = admin.
- "Voltar" restaura a sessao admin. Cliente nao ve o banner.

## Admin UI (LinkON)

Sidebar `/admin`: Visao geral, Usuarios, Workspaces, Logs.

- `/admin` — contadores: usuarios ativos, dominios verificados, jobs failed nas ultimas 24h, fila queued.
- `/admin/users` — tabela nome, login, papel, workspace, status. Criar / editar nome-email-senha-papel-workspace / desativar. Nao apaga.
- `/admin/workspaces` e `/admin/workspaces/:id` — DNS copy-paste, verificar, impersonar. Substitui o onboarding que estava em `/agency/new`.
- `/admin/logs` — duas listas:
  1. Jobs: workspace, destinatario, status (`queued`/`sent`/`failed`/`skipped`), motivo, `providerId`, horario. Filtro workspace + status + tipo.
  2. Audit: login, user.create/update/disable, domain.provision/verify, impersonate.start/stop, worker.tick.
- Eventos Mailgun (bounce/complaint/unsubscribe/delivered) na mesma pagina, aba Eventos.

`/agency` permanece para o operador da agencia (saude dos clientes), sem criar dominio nem usuario.

## Persistencia

Estender `data/mailon.json`:

```
User.role = "admin" | "agency" | "workspace"
User.status = "active" | "disabled"
SessionUser.role inclui "admin"
SessionUser.adminId?: string
SessionUser.impersonating?: boolean

AuditEvent {
  id, actorUserId, action, workspaceId?, targetUserId?, meta?, createdAt
}

Database.audit: AuditEvent[]
```

Seed: promover `arcanjo` para `role: "admin"`, `status: "active"`, senha `29172510`. Workspace Arcanjo Sales tech permanece para impersonacao. `xena.w@example.org` continua `agency`.

## Seguranca

- Webhook `POST /api/webhooks/mailgun`: HMAC SHA256 de `timestamp + token` conferido com `MAILGUN_WEBHOOK_SIGNING_KEY`. Sem chave em producao (`NODE_ENV=production`) → 401. `|now - timestamp| > 300s` → 401. Sem assinatura valida, nao suprime contato.
- Remover `GET`/`POST` `/api/worker/tick` (legado sem auth). So `POST /api/v1/worker/tick` com JWT `admin`/`agency` ou `MAILON_API_KEY`.
- `/api/v1`: sem token = 401. Usuario `disabled` = 401. `admin` acessa qualquer workspace. Workspace nao cria dominio, nao lista usuarios, nao le logs globais.
- Login UI + `POST /api/v1/auth/login`: 5 tentativas / minuto / IP (contador em memoria do processo); excesso = 429 `rate_limited`.
- Unsubscribe publico inalterado: so marca `suppressed`, sem vazar dados.
- Senhas nunca voltam na API. Audit nao grava hash nem senha em claro.

Novos erros HTTP:

| HTTP | `error` | Significado |
|---|---|---|
| 403 | `admin_only` | rota de dominio/usuario/audit |
| 401 | `disabled` | usuario desativado |
| 401 | `invalid_signature` | webhook sem HMAC |
| 429 | `rate_limited` | login acima do teto |

## API admin

| Metodo | Rota | Quem |
|---|---|---|
| GET | `/api/v1/users` | admin |
| POST | `/api/v1/users` | admin — `{ name, email, password, role, workspaceId?, status? }` |
| GET | `/api/v1/users/:id` | admin |
| PATCH | `/api/v1/users/:id` | admin — nome/email/senha/papel/workspace/status |
| POST | `/api/v1/workspaces` | **admin** (antes agency) |
| POST | `/api/v1/workspaces/:id/verify-domain` | **admin** |
| GET | `/api/v1/jobs` | admin — query `workspaceId`, `status`, `type` |
| GET | `/api/v1/events` | admin — query `workspaceId`, `type` |
| GET | `/api/v1/audit` | admin |
| POST | `/api/v1/worker/tick` | admin ou agency (JWT/API key). Sem GET |

`MAILON_API_KEY` autentica como o primeiro `admin` (nao mais como agency).

## Docs a atualizar na implementacao

- `docs/PRODUCT.md` — papel `admin`, onboarding (cliente so email; admin DNS).
- `docs/ARCHITECTURE.md` — roles, impersonacao, audit, webhook HMAC, worker so autenticado.
- `docs/API.md` — rotas admin, erros novos, worker sem GET, webhook assinado.
- `docs/INTEGRATION.md` — criar workspace/DNS e so admin; API key age como admin.
- `README.md` — login `arcanjo` / admin; aviso de que o legado `/api/worker/tick` sumiu.

## Testes

Estender `src/lib/api-v1.test.ts`:

- login `arcanjo` / `29172510` → role `admin`
- `disabled` nao autentica
- workspace nao cria dominio (`403 admin_only`)
- agency nao cria dominio (`403 admin_only`)
- admin cria usuario e workspace
- admin lista jobs/audit
- worker tick sem token = 401
- webhook sem assinatura = 401 (quando a signing key existe)

## Out of scope

- Multiplos super-admins alem do seed (CRUD permite criar outro `admin`, UI nao e o foco)
- 2FA
- Apagar workspace ou historico
- Painel de DNS no `/app`
- Assinatura do unsubscribe publico alem do token `w`+`c` atual

## Brand

Visual identico ao LinkON ja aplicado: `--ink` `#0a0a0b`, `--gold-500` `#d4af37`, `--cream` `#f5f2ea`, grain/grid, gold-frame, shell `max-w-[88rem]`.
