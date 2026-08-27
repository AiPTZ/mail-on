import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

function statusLabel(status: string) {
  if (status === "sent") return "enviada";
  if (status === "blocked") return "cancelada";
  if (status === "sending") return "enviando";
  if (status === "scheduled") return "agendada";
  return status;
}

export default async function CampaignsPage() {
  const session = await getSession();
  const campaigns = readDb()
    .campaigns.filter((c) => c.workspaceId === session!.workspaceId)
    .slice()
    .sort((a, b) => (b.sentAt || b.scheduledAt || "").localeCompare(a.sentAt || a.scheduledAt || ""));

  return (
    <div>
      <PageHeader
        kicker="Disparo"
        title="Campanhas"
        subtitle="Selecione os contatos no disparo. Relatorio: enviados, abertos e spam."
        actions={
          <Link
            href="/app/campaigns/new"
            className="btn btn-primary"
          >
            Nova campanha
          </Link>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Assunto</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Enviados</th>
              <th className="px-4 py-3">Abertos</th>
              <th className="px-4 py-3">Spam</th>
              <th className="px-4 py-3">Respostas</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-ink-400">
                <td className="px-4 py-3">
                  <Link href={`/app/campaigns/${c.id}`} className="hover:text-gold-400">
                    {c.name}
                  </Link>
                  <p className="mt-1 font-mono text-[11px] text-cream/35">{c.id}</p>
                </td>
                <td className="px-4 py-3 text-cream/70">{c.subject}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "blocked" ? "danger" : c.status === "sent" ? "ok" : "gold"}>
                    {statusLabel(c.status)}
                  </Badge>
                  {c.blockedReason ? (
                    <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-cream/40">{c.blockedReason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">{c.stats.sent}</td>
                <td className="px-4 py-3">{c.stats.opened}</td>
                <td className="px-4 py-3">{c.stats.complained}</td>
                <td className="px-4 py-3">{c.stats.replied || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
