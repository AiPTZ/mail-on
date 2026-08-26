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

JWT sai de `POST /api/v1/auth/login`. A API key autentica como **agency**. Cookie `mailon_session` tambem vale (mesmo token da UI).

Agency (JWT ou API key) opera um workspace assim:

```
X-Workspace-Id: ws_xxx
```

ou `workspaceId` no JSON. Sem isso, rotas de lista/campanha/template/sequencia respondem `403 workspace_required`.

Resposta: `{ ok: true, ... }` ou `{ ok: false, error }` com HTTP 4xx/5xx.

Erros frequentes:

| HTTP | `error` | Significado |
|---|---|---|
| 401 | `unauthenticated` / `invalid_credentials` | sem token ou senha errada |
| 403 | `agency_only` | so agency cria workspace / verifica DNS |
| 403 | `workspace_required` | agency sem `X-Workspace-Id` |
| 404 | `not_found` / `list_not_found` / `template_not_found` | id fora do workspace |
| 409 | `email_taken` | login do workspace ja existe |
| 400 | `missing_fields` | body incompleto |

---

## Auth

| Metodo | Rota | Quem | Body / retorno |
|---|---|---|---|
| POST | `/api/v1/auth/login` | publico | `{ email, password }` → `{ token, user }` |
| GET | `/api/v1/me` | autenticado | `{ user }` |

## Workspaces e dominio

| Metodo | Rota | Quem | Body / retorno |
|---|---|---|---|
| GET | `/api/v1/workspaces` | agency lista todos; workspace ve o seu | `{ workspaces }` |
| POST | `/api/v1/workspaces` | agency | `{ name, email, password, domain, fromName?, fromLocal? }` → `{ workspace, domain }` |
| GET | `/api/v1/workspaces/:id` | dono | `{ workspace, domain }` |
| GET | `/api/v1/workspaces/:id/health` | dono | cap, bounce, complaint, remainingToday |
| POST | `/api/v1/workspaces/:id/verify-domain` | agency | chama Mailgun verify; `verified` ou `failed` |

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
| POST | `/api/v1/campaigns` | `{ name, subject, listId, templateId, previewText?, scheduledAt?, sendNow? }` |
| GET | `/api/v1/campaigns/:id` | |
| POST | `/api/v1/campaigns/:id/send` | enfileira + tick |

Se o dominio nao esta `verified`, a campanha vai para `blocked`. So contatos `active` da lista entram na fila.

## Sequencias

| Metodo | Rota | Body |
|---|---|---|
| GET | `/api/v1/sequences` | |
| POST | `/api/v1/sequences` | `{ name, steps: [{ templateId, subject, delayDays }] }` max 3 |
| GET | `/api/v1/sequences/:id` | |
| POST | `/api/v1/sequences/:id/enroll` | `{ listId }` enrollment **manual** |

## Worker

| Metodo | Rota | Quem |
|---|---|---|
| POST | `/api/v1/worker/tick` | autenticado |
| GET | `/api/v1/worker/tick` | autenticado |

Despacha jobs ate o teto diario do sending domain. Em producao, chamar via cron a cada 1–5 min.

## Publico (fora de /v1)

| Metodo | Rota | Uso |
|---|---|---|
| POST | `/api/webhooks/mailgun` | bounce / complaint / unsub → suppress |
| GET | `/api/public/unsubscribe?w=&c=` | descadastro one-click |

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
# 1. login
curl -sS -X POST "$HOST/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"xena.w@example.org","password":"..."}'
# → { "ok": true, "token": "<jwt>", "user": { "role": "agency", ... } }

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
