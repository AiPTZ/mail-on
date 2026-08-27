import { notFound } from "next/navigation";
import { refreshCampaignStatsAction, sendCampaignAction } from "@/lib/actions";
import { Badge, Button, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";
import { buildCampaignReport } from "@/lib/worker";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const session = await getSession();
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === id && c.workspaceId === session?.workspaceId);
  if (!campaign) notFound();
  const report = buildCampaignReport(campaign.id);
  const rows = report?.rows || [];
  const stats = report?.stats || campaign.stats;
  const sent = Math.max(1, stats.sent);
  const domain = db.domains.find((d) => d.workspaceId === campaign.workspaceId);
  const remaining = Math.max(0, (domain?.dailyCap || 0) - (domain?.sentToday || 0));
  const queuedLeft = rows.filter((r) => !r.sent && !r.bounced).length;

  return (
    <div>
      <PageHeader
        kicker="Campanha"
        title={campaign.name}
        subtitle={campaign.subject}
        actions={
          <>
            <form action={refreshCampaignStatsAction.bind(null, campaign.id)}>
              <Button type="submit" variant="line">
                Atualizar Mailgun
              </Button>
            </form>
            <a href={`/api/v1/campaigns/${campaign.id}/report?format=xlsx`} className="btn btn-primary">
              Baixar relatorio atual
            </a>
            {campaign.status === "draft" || campaign.status === "blocked" ? (
              <form action={sendCampaignAction.bind(null, campaign.id)}>
                <Button type="submit">Disparar</Button>
              </form>
            ) : null}
          </>
        }
      />
      {campaign.blockedReason ? (
        <p className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-cream">
          {campaign.blockedReason}
        </p>
      ) : null}
      {campaign.status === "sending" ? (
        <p className="mb-6 rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-sm text-cream">
          Fila: {queuedLeft} pendente(s). Teto hoje {domain?.sentToday || 0}/{domain?.dailyCap || 0}
          {remaining === 0
            ? " — esgotado, o restante espera o warmup de amanha."
            : ` — ainda cabem ${remaining} neste dominio.`}
        </p>
      ) : null}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Abertos"
          value={stats.opened}
          hint={`${((100 * stats.opened) / sent).toFixed(1)}% dos enviados`}
        />
        <Stat
          label="Spam"
          value={stats.complained}
          hint={`${((100 * stats.complained) / sent).toFixed(2)}% complaint`}
        />
        <Stat
          label="Respondidos"
          value={stats.replied || 0}
          hint="resposta unica por contato"
        />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={campaign.status} />
        <Stat label="Enviados" value={stats.sent} hint={`${queuedLeft} ainda na fila`} />
        <Stat label="Entregues" value={stats.delivered} />
        <Stat
          label="Bounce"
          value={stats.bounced}
          hint={stats.bounced ? "falha permanente do destinatario" : "nenhum bounce permanente"}
        />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Enviado</th>
              <th className="px-4 py-3">Aberto</th>
              <th className="px-4 py-3">Spam</th>
              <th className="px-4 py-3">Respondido</th>
              <th className="px-4 py-3">Bounce</th>
              <th className="px-4 py-3">Clique</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-cream/40">
                  Nenhum disparo nesta campanha.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.email} className="border-t border-ink-400">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs">{row.email}</p>
                    <p className="text-xs text-cream/40">{row.name || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.sent ? "ok" : "muted"}>{row.sent ? "sim" : "nao"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.opened ? "gold" : "muted"}>{row.opened ? "sim" : "nao"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.complained ? "danger" : "muted"}>{row.complained ? "sim" : "nao"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.replied ? "ok" : "muted"}>{row.replied ? "sim" : "nao"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.bounced ? "danger" : "muted"}>{row.bounced ? "sim" : "nao"}</Badge>
                    {row.bounceReason ? (
                      <p className="mt-1 max-w-[240px] text-[11px] leading-snug text-cream/45">{row.bounceReason}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.clicked ? "ok" : "muted"}>{row.clicked ? "sim" : "nao"}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
