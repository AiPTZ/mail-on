# Mail ON — produto

SaaS white-label de email marketing para agencia. Cada cliente dispara **somente** do subdominio autenticado dele (`mail.cliente.com` ou `mg.cliente.com`). Sem mascara. Sem From da agencia. Sem raiz `cliente.com`.

## Problema

Agencia queima o dominio do cliente (ou o proprio) mandando marketing de SMTP compartilhado / From mascarado. O cliente nao consegue montar o email sozinho, entao o produto nao e self-serve.

## Promessa

1. Agencia provisiona DNS uma vez.
2. Cliente importa base, monta o HTML, dispara.
3. Reputacao fica isolada por sending domain, com warmup e suppress automatico.

## Papeis

| Papel | Login | Pode |
|---|---|---|
| Agency | painel `/agency` | criar workspace, colar DNS, verificar dominio, ver saude de todos, impersonar |
| Workspace | painel `/app` | listas, templates Unlayer, campanhas, sequencias, processar fila |

O modelo ja e multi-agencia. A UI do MVP atende uma agencia e N clientes.

## Funcionalidades

### Dominio de envio

- 1 sending domain por workspace (1:1).
- Mailgun provisiona SPF, DKIM, tracking; DMARC entra no DNS de exemplo.
- Status: `pending` → `verified` | `failed`.
- From travado em `{local}@{sendingDomain}`. Nunca outro host.
- Sem `verified`, campanha vai para `blocked`. Zero envio.

Cinco subdominios **nao** viram cinco tetos. Gmail/Microsoft olham o sub **e** o dominio organizacional. Subs extras so isolam fluxo (transacional vs marketing); cada um aquece do dia 1.

### Contatos

- Listas dentro do workspace.
- Import UI: `.xlsx` / `.xls` / `.csv`. Modelo em `/modelo-contatos.xlsx`.
- Colunas: `email` (obrigatorio), `nome`, `tags` (opcional, separadas por `,` `;` `|`).
- Import API: JSON com `crmContactId` opcional (id externo) e `source: crm`.
- Dedup por email na lista.
- Bounce hard, complaint e unsubscribe **suprimem na hora**, workspace-wide. Reimport **nao** reativa.

### Templates

- Unlayer embed (`displayMode: email`). Sem Project ID no MVP.
- Persistido: `designJson` + `html`. O HTML e o que sai no Mailgun.
- Placeholder `{{unsubscribe_url}}` e substituido no dispatch.

### Campanha (one-shot)

- Lista + template + assunto + preview.
- Agora ou `scheduledAt`.
- Snapshot do HTML no job (editar o template depois nao muda o que ja foi enfileirado).
- So contatos `active` da lista.

### Sequencia

- Ate 3 passos. Delay em dias entre eles.
- Enrollment **manual**: operador escolhe a lista e inicia.
- Contato ja inscrito nao entra de novo.
- Contato suprimido no meio → enrollment `stopped`.
- Modelo tem `enrollment` para auto-enroll futuro, sem rewrite.

### Fila e warmup

Nada sai no clique de "enviar". Vira job `queued`. O botao **Processar fila** ou `POST /api/v1/worker/tick` despacha ate o teto do dia.

| warmupDay | teto / dia |
|---|---|
| 1–3 | 50 |
| 4–7 | 200 |
| 8–14 | 500 |
| 15–21 | 2.000 |
| 22+ | 10.000 |

Sobe no virar do dia **somente** se bounce < 2% e complaint < 0.08%. Estourou: teto congela. Jobs extras dormem.

O plano Mailgun (ex. 50k/mes) e teto de **conta**. O warmup e mais apertado de proposito.

### Compliance

Todo disparo leva:

- header `List-Unsubscribe`
- header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- link publico `GET /api/public/unsubscribe?w=&c=`

### Relatorio

Stats por campanha: queued, sent, delivered, opened, clicked, bounced, complained, unsubscribed.

Open/click dependem de webhook Mailgun configurado. Bounce/complaint/unsub ja entram pelo webhook ou pelo link de descadastro.

## Fora do v1

- UI de agencia-de-agencias
- Auto-enrollment / trigger por evento
- IP dedicado
- Sync nativo com ferramentas externas (hoje a API recebe o JSON)
- MTA proprio
- Cron embutido (o worker e sob demanda)

## Contas de preview

- Agency: `xena.w@example.org` / `mailon123`
- Workspace demo: `olivia.t@example.org` / `aurora123`
- Workspace Mailgun real (se provisionado): usuario `arcanjo`

## Fluxo do cliente (ops)

1. Agency cria workspace + sending domain.
2. Cliente cola os records DNS. Agency clica verificar.
3. Workspace importa XLSX (ou um sistema externo empurra JSON na API).
4. Monta template no Unlayer, salva.
5. Cria campanha ou sequencia.
6. Processar fila (ou cron em `POST /api/v1/worker/tick`).
7. Bounce/complaint voltam no webhook e saem da base.
