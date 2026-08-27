# Mail ON — arquitetura

App fino em cima do Mailgun. A reputacao mora no Mail ON. O Mailgun e so o MTA.

## Vista

```
UI Next.js                 REST /api/v1           Publico
/admin  /agency  /app  →   src/lib/api-v1.ts  →  /api/webhooks/mailgun (HMAC)
Server Actions         ↗         │               /api/public/unsubscribe
                          ▼
                    store JSON
                    data/mailon.json
                          │
                    worker.ts
                    warmup.ts
                          ▼
                    mailgun.ts
                    POST /v3/{domain}/messages
```

## Stack

| Camada | Hoje | Evolucao |
|---|---|---|
| App | Next.js 14.2 App Router, React 18, Tailwind 4 | igual |
| Auth UI | cookie JWT `mailon_session` HS256 14d | SSO opcional |
| Auth API | Bearer JWT ou `MAILON_API_KEY` | igual |
| Persistencia | JSON `data/mailon.json` | Postgres quando o volume exigir |
| Editor | Unlayer `embed.js` | permanece no browser |
| Import | SheetJS + parser CSV / JSON na API | igual |
| Fila | in-process `tickWorker()` | cron 1–5 min ou Redis/Bull |
| Provider | Mailgun US/EU | igual |

Next 16 / React 19 foram abandonados neste ambiente (SIGBUS no SWC). Nao subir de versao sem teste.

## Tenancy

```
Admin (plataforma)
  └── Agency
        └── Workspace          (cliente)
              ├── SendingDomain   1:1 (so admin provisiona/verifica)
              ├── Users role=workspace (so admin cria/edita/desativa)
              ├── Lists → Contacts
              ├── Templates
              ├── Campaigns
              └── Sequences → Enrollments → Jobs → Events
                    + audit[]
```

Isolamento: usuario so ve o `workspaceId` da sessao. Agency ve todos da `agencyId`. Admin ve tudo. API key = primeiro `admin`; precisa `X-Workspace-Id` para mutar lista/campanha. Workspace configura `fromName` / `fromLocal` / `replyTo` em `PATCH /workspaces/:id/sender`. From permanece `@` sending domain.

IDs prefixados: `ag_`, `ws_`, `usr_`, `dom_`, `lst_`, `ct_`, `tpl_`, `cmp_`, `seq_`, `enr_`, `job_`, `evt_`, `aud_`.

Usuario tem `status` `active` | `disabled`. Desativado nao autentica. Sem exclusao fisica.

Impersonacao: JWT guarda `adminId` + `impersonating`. Banner no `/app`. Audit registra start/stop.

## Arquivos que importam

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/types.ts` | contratos |
| `src/lib/store.ts` | persistencia + seed |
| `src/lib/auth.ts` | JWT / cookie |
| `src/lib/api-v1.ts` | REST (fonte da verdade da API) |
| `src/lib/actions.ts` | Server Actions da UI |
| `src/lib/worker.ts` | fila, cap, suppress, enrollment |
| `src/lib/warmup.ts` | teto diario |
| `src/lib/mailgun.ts` | provision / verify / send |
| `src/lib/csv.ts` | parse XLSX/CSV |
| `src/app/api/v1/[...path]/route.ts` | HTTP catch-all |
| `src/lib/audit.ts` | append de AuditEvent |
| `src/lib/rate-limit.ts` | 5 login/min/IP |
| `src/lib/mailgun-webhook.ts` | HMAC timestamp+token |
| `src/middleware.ts` | protege `/admin`, `/agency` e `/app` |

Trocar o store **nao** exige reescrever worker/mailgun/api-v1 se a interface `readDb` / `writeDb` permanecer.

## Pipeline de envio

```
create campaign / enroll sequence
        │
        ├─ domain.status !== verified  → campaign.blocked
        ├─ snapshot template.html no job
        └─ so contact.status === active
                │
                ▼
           job.queued
                │
        tickWorker()
                │
        ├─ remainingCap = dailyCap - sentToday
        ├─ From = "{fromName} <{fromEmail}>"
        ├─ injeta {{unsubscribe_url}}
        ├─ Mailgun + List-Unsubscribe
        └─ job.sent ; sentToday++
                │
        webhook bounce|complaint|unsub
                └─ contact.suppressed
```

Jobs alem do teto ficam `queued`. Proximo tick no dia seguinte pega o restante, se o warmup deixar subir.

Sequencia: passo `n` so entra na fila se `nextRunAt <= now`. Depois do send, avanca `currentStep` e soma `delayDays`. Nao recria job de passo ja `queued` ou `sent`.

## Auth

- UI: cookie httpOnly `mailon_session`.
- API: `Authorization: Bearer`, `X-Api-Key`, ou o mesmo cookie.
- `MAILON_API_KEY` autentica como o primeiro usuario `admin`.
- Admin/agency age num workspace com `X-Workspace-Id` ou `workspaceId` no body.
- Login: 5 tentativas / minuto / IP (`429 rate_limited`). Usuario `disabled` = 401.

Tres papeis: `admin`, `agency`, `workspace`. Sem RBAC fino (editor vs viewer).

## Worker

Nao ha cron no processo. Quem chama:

- botao Processar fila (Server Action)
- `POST /api/v1/worker/tick` (JWT admin/agency ou `MAILON_API_KEY`). Sem GET.

`/api/worker/tick` legado responde 404. Em producao: cron a cada 1–5 min. Em volume alto (> dezenas de milhares/dia), sair do in-process para fila.

## Mailgun

Env:

```
MAILGUN_API_KEY=
MAILGUN_API_BASE=https://api.mailgun.net
MAILGUN_WEBHOOK_SIGNING_KEY=
```

EU: `https://api.eu.mailgun.net`.

Sem `MAILGUN_API_KEY`: modo demo (DNS fake, `providerId` `demo_*`). Util em staging. Inutil em producao.

Webhook exige HMAC SHA256 de `timestamp + token` com `MAILGUN_WEBHOOK_SIGNING_KEY`. Sem chave ou assinatura invalida / replay > 5 min → `401 invalid_signature`. Eventos tratados: `delivered`, `opened`, `clicked`, `bounced`, `failed`, `complained`, `unsubscribed`. User-variables `jobId` e `campaignId` amarram o evento a campanha. Abertura/spam contam uma vez por contato.

## Persistencia

Arquivo unico `data/mailon.json` (gitignored). `MAILON_DATA_PATH` aponta para outro path (testes usam isso). `MAILON_SKIP_SEED=1` desliga o seed do Arcanjo.

Nao e concorrente. Dois ticks simultaneos podem colidir. Com Postgres: transacao ou lock no tick.

## Unlayer

Script `https://editor.unlayer.com/embed.js`. Init com `minHeight` calculado. O iframe ignora `min-height` CSS — a altura e passada no `unlayer.init`.

## Testes

```bash
npm test
```

Cobre login admin, disabled, 401, create workspace `admin_only`, campanha blocked, suppress que nao reativa, API key como admin, health/warmup, jobs/audit, worker sem token, GET tick 404, HMAC Mailgun.
