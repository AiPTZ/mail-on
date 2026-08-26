# Mail ON

SaaS white-label para a agencia disparar email marketing no dominio autenticado do cliente. Sem mascara. Sem subdominio da agencia.

Documentacao:

- `docs/README.md` — indice
- `docs/PRODUCT.md` — funcionalidades e limites
- `docs/ARCHITECTURE.md` — tenancy, worker, Mailgun
- `docs/API.md` — REST `/api/v1`
- `docs/INTEGRATION.md` — integracao via API

## MVP

- Agencia cria workspace e provisiona o sending domain
- DNS SPF / DKIM / tracking via Mailgun
- Cliente importa XLSX ou CSV (`email`, `nome`, `tags`)
- Editor Unlayer; HTML fica no Mail ON
- Campanha one-shot e sequencia de ate 3 emails (enrollment manual)
- Warmup diario por dominio
- Bounce, complaint e unsubscribe suprimem o contato
- REST `/api/v1`
- Mailgun em producao; demo se a chave nao existir

## Preview

- Agency: `xena.w@example.org` / `mailon123`
- Cliente demo: `olivia.t@example.org` / `aurora123`
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

Webhook Mailgun: `POST /api/webhooks/mailgun`.
Descadastro: `GET /api/public/unsubscribe?w=&c=`.

## Regras de dominio

From sempre no subdominio de envio do cliente. Nada sai sem status `verified`. Teto diario sobe so com bounce abaixo de 2% e complaint abaixo de 0.08%.
