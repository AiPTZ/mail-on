# Mail ON — integracao via API

Como outro sistema fala com o Mail ON por HTTP. O painel (`/admin`, `/agency`, `/app`) continua independente. Contratos em `docs/API.md`.

## Mapa

| Conceito externo | Mail ON |
|---|---|
| conta da plataforma | `Admin` |
| conta da operadora | `Agency` (leitura) |
| conta do cliente | `Workspace` |
| contato | `Contact` (`crmContactId` opcional + email) |
| opt-out / bounce | `Contact.status = suppressed` |
| disparo | `Campaign` ou `Sequence` |
| cron | `POST /api/v1/worker/tick` |

1 workspace = 1 sending domain. Guardar `workspaceId` depois do create.

## Identidade

1. API key de admin (`MAILON_API_KEY`) + `X-Workspace-Id` em toda chamada. Melhor para backend-to-backend. A key autentica como o primeiro `admin`.
2. `POST /api/v1/auth/login` com usuario do workspace. Token 14 dias.
3. Cookie `mailon_session` da UI tambem vale nas rotas `/api/v1`.

## Contatos

**Import JSON**

```
POST /api/v1/lists/{listId}/contacts
X-Workspace-Id: ws_xxx
{
  "contacts": [
    {
      "email": "ana@empresa.com",
      "name": "Ana Costa",
      "tags": ["vip"],
      "crmContactId": "ext_1"
    }
  ]
}
```

Regras:

- Email `suppressed` no workspace **nao reativa**.
- Dedup por email na lista. `crmContactId` e gancho externo, nao chave unica.
- `source` grava `crm` nesse endpoint (import de sistema). XLSX/CSV na UI grava `xlsx` / `csv`.

**Lista pontual**

Criar lista, importar o recorte, disparar. Serve para blast. Nao serve para sequencia longa.

Nunca reimportar quem deu bounce. O webhook Mailgun deve atualizar a base de origem (`do_not_email`).

## Sequencia minima

1. Admin cria o workspace:

```
POST /api/v1/workspaces
{
  "name": "Cliente X",
  "email": "ops@clientex.com",
  "password": "...",
  "domain": "mail.clientex.com",
  "fromName": "Cliente X"
}
```

2. Cliente publica SPF/DKIM/DMARC/CNAME/MX. Admin:

```
POST /api/v1/workspaces/{id}/verify-domain
```

3. Guardar `workspaceId`, `listId`, `domain.status`.

4. Cron 1–5 min:

```
POST /api/v1/worker/tick
Authorization: Bearer {MAILON_API_KEY}
```

5. Bounce/complaint entram pelo webhook Mailgun **assinado** (`MAILGUN_WEBHOOK_SIGNING_KEY`). Sem HMAC valido o contato nao e suprimido. Opt-out entra pelo link publico. Poll `GET /contacts` filtrando `suppressed` se precisar espelhar o status.

6. Disparo:

```
POST /api/v1/campaigns
X-Workspace-Id: ws_xxx
{
  "name": "Lancamento",
  "subject": "Novidade",
  "listId": "lst_xxx",
  "templateId": "tpl_xxx",
  "sendNow": true
}
```

Se `domain.status !== verified`, a campanha volta `blocked`.

## Eventos

| Evento | Origem | Acao |
|---|---|---|
| bounce / failed | webhook Mailgun | parar cadencia naquele email |
| complained | webhook Mailgun | never email |
| unsubscribed | webhook ou `/api/public/unsubscribe` | opt-out |
| campaign.blocked | resposta da API | pedir DNS |
| remainingToday = 0 | `/workspaces/:id/health` | adiar blast |

Ainda nao existe `PATCH /contacts/:id` nem auto-enroll por evento.

## Nao negociavel

1. From sempre no sending domain verificado. Sem mascara, sem `@agencia`, sem raiz.
2. Nada sai com dominio `pending` / `failed`.
3. Hard bounce, complaint, unsubscribe = suppress imediato, workspace-wide.
4. `List-Unsubscribe` em 100% das mensagens (o worker injeta).
5. Warmup por dominio. Varios subdominios nao multiplicam teto.
6. HTML e reputacao ficam no Mail ON. Mailgun e so MTA.
