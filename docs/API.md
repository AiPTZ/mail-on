# Mail ON API v1

REST do produto. A UI usa Server Actions; sistemas externos usam estas rotas.

Base: `/api/v1`

Auth:

```
Authorization: Bearer <jwt>
```

ou

```
Authorization: Bearer <MAILON_API_KEY>
X-Api-Key: <MAILON_API_KEY>
```

JWT sai de `POST /api/v1/auth/login`. A API key autentica como o primeiro **admin**. Cookie `mailon_session` tambem vale (mesmo token da UI).

Admin ou agency (JWT ou API key) opera um workspace assim:

```
X-Workspace-Id: ws_xxx
```

ou `workspaceId` no JSON. Sem isso, rotas de lista/campanha/template/sequencia respondem `403 workspace_required`.

Resposta: `{ ok: true, ... }` ou `{ ok: false, error }` com HTTP 4xx/5xx.

Erros frequentes:

| HTTP | `error` | Significado |
|---|---|---|
| 401 | `unauthenticated` / `invalid_credentials` | sem token ou senha errada |
| 401 | `disabled` | usuario desativado |
| 401 | `invalid_signature` | webhook Mailgun sem HMAC valido |
| 403 | `admin_only` | so admin cria workspace / verifica DNS / CRUD usuario / le logs |
| 403 | `workspace_required` | admin/agency sem `X-Workspace-Id` |
| 404 | `not_found` / `list_not_found` / `template_not_found` | id fora do workspace |
| 409 | `email_taken` | login ja existe |
| 400 | `missing_fields` | body incompleto |
| 429 | `rate_limited` | login acima de 5/min/IP |

---

## Auth

| Metodo | Rota | Quem | Body / retorno |
|---|---|---|---|
| POST | `/api/v1/auth/login` | publico | `{ email, password }` → `{ token, user }` |
| GET | `/api/v1/me` | autenticado | `{ user }` |

Login: 5 tentativas / minuto / IP. Usuario `disabled` = 401.

## Usuarios (admin)

| Metodo | Rota | Quem | Body / retorno |
|---|---|---|---|
| GET | `/api/v1/users` | admin | `{ users }` (sem hash) |
| POST | `/api/v1/users` | admin | `{ name, email, password, role, workspaceId?, status? }` |
| GET | `/api/v1/users/:id` | admin | `{ user }` |
| PATCH | `/api/v1/users/:id` | admin | nome / email / senha / papel / workspace / status |

Sem exclusao fisica. Ultimo admin nao desativa.

## Workspaces e dominio

| Metodo | Rota | Quem | Body / retorno |
|---|---|---|---|
| GET | `/api/v1/workspaces` | admin lista todos; agency os da agencia; workspace ve o seu | `{ workspaces }` |
| POST | `/api/v1/workspaces` | admin | `{ name, email, password, domain, fromName?, fromLocal? }` → `{ workspace, domain }` |
| GET | `/api/v1/workspaces/:id` | dono | `{ workspace, domain }` |
| GET | `/api/v1/workspaces/:id/health` | dono | cap, bounce, complaint, remainingToday |
| POST | `/api/v1/workspaces/:id/verify-domain` | admin | chama Mailgun verify; `verified` ou `failed` |
| PATCH | `/api/v1/workspaces/:id/sender` | workspace (ou admin) | `{ fromName?, fromLocal?, replyTo? }` |

`fromLocal` e so a parte antes do `@`. From sempre `{fromLocal}@{sendingDomain}`. `from_locked_to_domain` se vier host. `replyTo` aceita qualquer email valido (caixa de resposta). Vazio remove o Reply-To.

`domain` nasce `pending`. From fica travado em `{fromLocal}@{domain}`. Nada dispara ate `verified`.

## Listas e contatos

| Metodo | Rota | Body |
|---|---|---|
| GET | `/api/v1/lists` | |
| POST | `/api/v1/lists` | `{ name }` |
| POST | `/api/v1/lists/:id/contacts` | `{ contacts: [{ email, name?, tags?, crmContactId? }] }` |
| GET | `/api/v1/contacts` | |

Import JSON. Emails `suppressed` no workspace **nao reativam**. Dedup por email na lista. `source` grava `crm` neste endpoint.

XLSX/CSV continua na UI (`/app/audience`). Modelo: `/modelo-contatos.xlsx`.

## Templates

| Metodo | Rota | Body |
|---|---|---|
| GET | `/api/v1/templates` | |
| POST | `/api/v1/templates` | `{ name, html, designJson? }` |
| GET | `/api/v1/templates/:id` | |
| PUT | `/api/v1/templates/:id` | `{ name, html, designJson? }` |

HTML e o payload enviado. Unlayer e so o editor da UI.

## Campanhas

| Metodo | Rota | Body |
|---|---|---|
| GET | `/api/v1/campaigns` | |
| POST | `/api/v1/campaigns` | `{ name, subject, listId, templateId, previewText?, scheduledAt?, sendNow?, contactIds? }` |
| GET | `/api/v1/campaigns/:id` | |
| GET | `/api/v1/campaigns/:id/report` | `{ campaign, stats, rows, csv }`. `?format=xlsx` planilha Excel (Resumo + Contatos). `?format=csv` arquivo texto |
| POST | `/api/v1/campaigns/:id/send` | enfileira + tick |

`contactIds` opcional: recorte da lista. Sem o campo, todos os `active`. Com array, so esses ids (ainda precisam estar `active` na lista). Dominio `pending`/`failed` = campanha `blocked`.

Stats: sent, delivered, opened, clicked, bounced, complained, unsubscribed, replied. Open/click/spam entram pelo webhook Mailgun (HMAC) ou `POST /campaigns/:id/refresh` (Events API). Resposta conta quando o inbound (`stored`) chega no sending domain. Abertura e resposta sao unicas por contato.

## Sequencias

| Metodo | Rota | Body |
|---|---|---|
| GET | `/api/v1/sequences` | |
| POST | `/api/v1/sequences` | `{ name, steps: [{ templateId, subject, delayDays }] }` max 3 |
| GET | `/api/v1/sequences/:id` | |
| POST | `/api/v1/sequences/:id/enroll` | `{ listId }` enrollment **manual** |

## Jobs, eventos e audit (admin)

| Metodo | Rota | Quem | Filtros |
|---|---|---|---|
| GET | `/api/v1/jobs` | admin | `workspaceId`, `status`, `type` |
| GET | `/api/v1/events` | admin | `workspaceId`, `type` |
| GET | `/api/v1/audit` | admin | |

## Worker

| Metodo | Rota | Quem |
|---|---|---|
| POST | `/api/v1/worker/tick` | JWT admin/agency ou `MAILON_API_KEY` |

Sem GET. `/api/worker/tick` legado responde 404. Despacha jobs ate o teto diario do sending domain. Em producao, cron a cada 1–5 min.

## Publico (fora de /v1)

| Metodo | Rota | Uso |
|---|---|---|
| POST | `/api/webhooks/mailgun` | HMAC obrigatorio; bounce / complaint / unsub → suppress |
| GET | `/api/public/unsubscribe?w=&c=` | descadastro one-click |

Webhook: HMAC SHA256 de `timestamp + token` com `MAILGUN_WEBHOOK_SIGNING_KEY`. Sem chave, assinatura invalida ou replay > 300s → `401 invalid_signature`.

---

## Regras que a API nao burla

1. From sempre `@` sending domain verificado.
2. Dominio `pending`/`failed` = zero envio.
3. Bounce, complaint, unsubscribe = contato `suppressed` no workspace.
4. Warmup por dominio: 50 → 200 → 500 → 2k → 10k/dia; sobe so com bounce < 2% e complaint < 0.08%.
5. `List-Unsubscribe` e injetado no send, nao no create da campanha.

## Env

```
AUTH_SECRET=
MAILON_API_KEY=
MAILGUN_API_KEY=
MAILGUN_API_BASE=https://api.mailgun.net
MAILGUN_WEBHOOK_SIGNING_KEY=
```

## Exemplo

```bash
# 1. login admin
curl -sS -X POST "$HOST/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"arcanjo","password":"..."}'
# → { "ok": true, "token": "<jwt>", "user": { "role": "admin", ... } }

# 2. criar workspace + sending domain
curl -sS -X POST "$HOST/api/v1/workspaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cliente X","email":"ops@x.com","password":"...","domain":"mail.x.com","fromName":"Cliente X"}'

# 3. verificar DNS (depois do cliente publicar SPF/DKIM)
curl -sS -X POST "$HOST/api/v1/workspaces/$WS/verify-domain" \
  -H "Authorization: Bearer $TOKEN"

# 4. lista + contatos
curl -sS -X POST "$HOST/api/v1/lists" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ativos"}'

curl -sS -X POST "$HOST/api/v1/lists/$LIST/contacts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"contacts":[{"email":"ana@x.com","name":"Ana","crmContactId":"crm_1","tags":["vip"]}]}'

# 5. template + campanha
curl -sS -X POST "$HOST/api/v1/templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Oi","html":"<p>Ola</p><p><a href=\"{{unsubscribe_url}}\">Sair</a></p>"}'

curl -sS -X POST "$HOST/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Blast","subject":"Oi","listId":"lst_xxx","templateId":"tpl_xxx","sendNow":true}'

# 6. saude + fila
curl -sS "$HOST/api/v1/workspaces/$WS/health" -H "Authorization: Bearer $TOKEN"
curl -sS -X POST "$HOST/api/v1/worker/tick" -H "Authorization: Bearer $TOKEN"
```

Indice: `docs/README.md`. Integracao: `docs/INTEGRATION.md`.
