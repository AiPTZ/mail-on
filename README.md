# Mail ON

SaaS white-label para a agencia disparar email marketing no dominio autenticado do cliente. Sem mascara. Sem subdominio da agencia.

Documentacao:

- `docs/README.md` — indice
- `docs/PRODUCT.md` — funcionalidades e limites
- `docs/ARCHITECTURE.md` — tenancy, worker, Mailgun
- `docs/API.md` — REST `/api/v1`
- `docs/INTEGRATION.md` — integracao via API

## MVP

- Admin cria workspace, usuario e provisiona o sending domain
- Agencia so le saude da propria agencia
- DNS SPF / DKIM / DMARC / CNAME / MX via Mailgun; verificar so no `/admin`
- Cliente importa XLSX ou CSV (`email`, `nome`, `tags`) e dispara no `/app`
- Editor Unlayer; HTML fica no Mail ON
- Campanha one-shot com selecao de contatos; relatorio enviado/aberto/spam/bounce/resposta
- Excel **Baixar relatorio atual** (`?format=xlsx`) e CSV
- Remetente no `/app/sender`: From local travado no sending domain, Reply-To livre
- Warmup diario por dominio
- Bounce, complaint e unsubscribe suprimem o contato
- REST `/api/v1`; API key = primeiro admin
- Webhook Mailgun com HMAC; worker so `POST /api/v1/worker/tick`
- Mailgun em producao; demo se a chave nao existir

## Preview

- Admin: `arcanjo` / `29172510` → `/admin`
- Agency: `xena.w@example.org` / `mailon123` → `/agency`
- Cliente demo: `olivia.t@example.org` / `aurora123` → `/app`
- Modelo de planilha: `/modelo-contatos.xlsx`

## Stack

Next.js 14 App Router, React 18, TypeScript, Tailwind, sessao JWT, persistencia JSON local, Unlayer embed, Mailgun API.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

```bash
npm test
npm run typecheck
```

Variaveis em `.env.example`. Sem `MAILGUN_API_KEY` o produto roda em demo: DNS de exemplo, envios gravados localmente.

Worker da fila (autenticado):

```bash
curl -X POST http://localhost:3000/api/v1/worker/tick \
  -H "Authorization: Bearer $MAILON_API_KEY"
```

Webhook Mailgun (HMAC obrigatorio): `POST /api/webhooks/mailgun`.
`/api/worker/tick` legado responde 404.
Descadastro: `GET /api/public/unsubscribe?w=&c=`.

## Regras de dominio

From sempre no subdominio de envio do cliente (`{local}@{sendingDomain}`). Reply-To e livre. Nada sai sem status `verified`. Teto diario sobe so com bounce abaixo de 2% e complaint abaixo de 0.08%. Bounce permanente (Mailgun `failed` + `severity=permanent`) suprime o contato; falha temporaria nao conta.

## Entrega para o programador

Repo: `https://github.com/AiPTZ/mail-on`

```bash
git clone https://github.com/AiPTZ/mail-on.git
cd mail-on
npm install
cp .env.example .env.local
```

Preencher `.env.local` (nao commitar):

```
AUTH_SECRET=
MAILON_API_KEY=
MAILGUN_API_KEY=
MAILGUN_API_BASE=https://api.mailgun.net
MAILGUN_WEBHOOK_SIGNING_KEY=
```

Persistencia e JSON em `data/mailon.json` (gitignored). Sem esse arquivo o app reseed no boot. Prisma no `package.json` ainda nao e usado.

Producao:

1. Cron 1–5 min: `POST /api/v1/worker/tick` com `Authorization: Bearer $MAILON_API_KEY`
2. Webhooks Mailgun Opened / Complained / Permanent Fail / Store → `POST /api/webhooks/mailgun`
3. Warmup comeca em 50/dia. Disparar de novo a mesma campanha nao refila.
