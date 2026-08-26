import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function CampaignsPage() {
  const session = await getSession();
  const campaigns = readDb().campaigns.filter((c) => c.workspaceId === session!.workspaceId);

  return (
    <div>
      <PageHeader
        kicker="Disparo"
        title="Campanhas"
        subtitle="Um envio, uma lista, um template. O worker respeita o teto diario do dominio."
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
              <th className="px-4 py-3">Entregues</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-ink-400">
                <td className="px-4 py-3">
                  <Link href={`/app/campaigns/${c.id}`} className="hover:text-gold-400">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-cream/70">{c.subject}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "blocked" ? "danger" : c.status === "sent" ? "ok" : "gold"}>
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">{c.stats.sent}</td>
                <td className="px-4 py-3">{c.stats.delivered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
