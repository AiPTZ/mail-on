# Mail ON — arquitetura

App fino em cima do Mailgun. A reputacao mora no Mail ON. O Mailgun e so o MTA.

## Vista

```
UI Next.js          REST /api/v1           Publico
/agency  /app   →   src/lib/api-v1.ts  →  /api/webhooks/mailgun
Server Actions  ↗         │               /api/public/unsubscribe
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
Agency
  └── Workspace          (cliente)
        ├── SendingDomain   1:1
        ├── Lists → Contacts
        ├── Templates
        ├── Campaigns
        └── Sequences → Enrollments → Jobs → Events
```

Isolamento: usuario so ve o `workspaceId` da sessao. Agency ve todos da `agencyId`. API key = agency; precisa `X-Workspace-Id` para mutar lista/campanha.

IDs prefixados: `ag_`, `ws_`, `usr_`, `dom_`, `lst_`, `ct_`, `tpl_`, `cmp_`, `seq_`, `enr_`, `job_`, `evt_`.

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
| `src/middleware.ts` | protege `/agency` e `/app` |

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
- `MAILON_API_KEY` autentica como o usuario agency da primeira agencia.
- Agency age num workspace com `X-Workspace-Id` ou `workspaceId` no body.

Nao ha RBAC fino (editor vs viewer). Dois papeis so.

## Worker

Nao ha cron no processo. Quem chama:

- botao Processar fila (Server Action)
- `POST /api/v1/worker/tick` (autenticado)
- `POST /api/worker/tick` (legado, **sem auth** — nao expor em producao sem lock)

Em producao: cron a cada 1–5 min. Em volume alto (> dezenas de milhares/dia), sair do in-process para fila.

## Mailgun

Env:

```
MAILGUN_API_KEY=
MAILGUN_API_BASE=https://api.mailgun.net
MAILGUN_WEBHOOK_SIGNING_KEY=
```

EU: `https://api.eu.mailgun.net`.

Sem `MAILGUN_API_KEY`: modo demo (DNS fake, `providerId` `demo_*`). Util em staging. Inutil em producao.

O webhook atual **nao valida assinatura**. Antes de producao, checar `MAILGUN_WEBHOOK_SIGNING_KEY`. Eventos tratados: `bounced`, `failed`, `complained`, `unsubscribed`.

## Persistencia

Arquivo unico `data/mailon.json` (gitignored). `MAILON_DATA_PATH` aponta para outro path (testes usam isso). `MAILON_SKIP_SEED=1` desliga o seed do Arcanjo.

Nao e concorrente. Dois ticks simultaneos podem colidir. Com Postgres: transacao ou lock no tick.

## Unlayer

Script `https://editor.unlayer.com/embed.js`. Init com `minHeight` calculado. O iframe ignora `min-height` CSS — a altura e passada no `unlayer.init`.

## Testes

```bash
npm test
```

Cobre login, 401, create workspace, 403 de workspace criando workspace, campanha blocked, suppress que nao reativa, API key, health/warmup, agency key + `workspaceId`.
