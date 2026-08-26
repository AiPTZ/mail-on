import { notFound } from "next/navigation";
import { sendCampaignAction } from "@/lib/actions";
import { Badge, Button, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

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
  const jobs = db.jobs.filter((j) => j.campaignId === campaign.id);

  return (
    <div>
      <PageHeader
        kicker="Campanha"
        title={campaign.name}
        subtitle={campaign.subject}
        actions={
          campaign.status === "draft" || campaign.status === "blocked" ? (
            <form action={sendCampaignAction.bind(null, campaign.id)}>
              <Button type="submit">Disparar</Button>
            </form>
          ) : null
        }
      />
      {campaign.blockedReason ? (
        <p className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-cream">
          {campaign.blockedReason}
        </p>
      ) : null}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Status" value={campaign.status} />
        <Stat label="Fila" value={campaign.stats.queued} />
        <Stat label="Enviados" value={campaign.stats.sent} />
        <Stat label="Entregues" value={campaign.stats.delivered} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Nota</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-ink-400">
                <td className="px-4 py-3 font-mono text-xs">{j.to}</td>
                <td className="px-4 py-3">
                  <Badge tone={j.status === "failed" ? "danger" : j.status === "sent" ? "ok" : "gold"}>
                    {j.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-cream/40">
                  {new Date(j.sentAt || j.scheduledAt).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-xs text-cream/40">{j.skipReason || j.providerId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
