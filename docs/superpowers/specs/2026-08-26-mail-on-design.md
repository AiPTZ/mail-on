# Mail ON — Design Spec

**Date:** 2026-08-26  
**Product:** Mail ON  
**Type:** White-label email marketing SaaS for agencies

## Problem

Agencies burn the client's root domain (or their own) by sending marketing from a shared/masked sender. Clients also cannot compose emails themselves, so the agency cannot sell a self-serve product.

## Solution

A multi-tenant app where each workspace sends only from the **client's authenticated sending subdomain** (`mail.cliente.com`). The agency provisions DNS. The client uploads a CSV, designs in Unlayer, sends one-off campaigns, and starts a 3-step sequence manually.

## Tenancy

```
Agency
  └── Workspace (client)
        ├── SendingDomain (1:1, Mailgun)
        ├── Lists → Contacts
        ├── Templates (Unlayer JSON + HTML)
        ├── Campaigns (one-shot)
        └── Sequences (max 3 steps, manual enrollment)
```

The data model is agency-ready from day one. The first UI only serves one agency operating its own workspaces.

## Roles

| Role | Can do |
|---|---|
| Agency admin | Create workspace, add sending domain, paste DNS, mark verified, see health of all workspaces |
| Workspace member | CSV, Unlayer, campaign, start sequence, reports |

## Domain rules (non-negotiable)

- No send unless domain status is `verified`
- From address always `@` the client's sending subdomain
- Never send from the agency domain, never spoof a root mailbox
- Warmup daily cap per domain; raise only if bounce < 2% and complaint < 0.08%
- Hard bounce and complaint suppress the contact immediately
- Every message includes unsubscribe link + `List-Unsubscribe` header

## Sequence rules

- Max 3 emails
- Delay in days between steps
- Enrollment is **manual** (operator picks a list and starts)
- Suppressed contacts are skipped
- Model has an `enrollment` table so auto-enroll can be added later without rewrite

## Contacts

- MVP ingest: CSV (`email`, `name`, optional `tags`)
- Schema already has `source` (`csv` | `crm` | `api`) for later connectors

## Stack

- Next.js App Router + TypeScript + Tailwind
- Prisma + SQLite (demo) / Postgres-ready schema
- Session cookie auth
- Mailgun API (demo mode if keys are missing)
- Unlayer embed (`react-email-editor`)
- In-process worker tick via `/api/worker/tick`

## Out of scope (v1)

- Agency-of-agencies UI
- Auto-enrollment
- Full automation / event triggers
- Dedicated IP
- Native CRM sync
- Custom MTA

## Brand

- Name: **Mail ON**
- Colors: black + gold
- Tone: premium operations tool, not a playful consumer app
