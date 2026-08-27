import Link from "next/link";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function WorkspaceHome() {
  const session = await getSession();
  const db = readDb();
  const workspaceId = session!.workspaceId!;
  const workspace = db.workspaces.find((w) => w.id === workspaceId);
  const domain = db.domains.find((d) => d.workspaceId === workspaceId);
  const contacts = db.contacts.filter((c) => c.workspaceId === workspaceId);
  const active = contacts.filter((c) => c.status === "active").length;
  const sent = db.jobs.filter((j) => j.workspaceId === workspaceId && j.status === "sent").length;
  const campaigns = db.campaigns.filter((c) => c.workspaceId === workspaceId);
  const sequences = db.sequences.filter((s) => s.workspaceId === workspaceId);

  return (
    <div>
      <PageHeader
        kicker={workspace?.name}
        title="Visao geral"
        subtitle="Nada sai deste workspace se o dominio nao estiver autenticado."
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Dominio"
          value={domain?.status === "verified" ? "Pronto" : "Bloqueado"}
          hint={`${domain?.fromEmail || domain?.domain}${domain?.replyTo ? ` · resp. ${domain.replyTo}` : ""}`}
        />
        <Stat label="Contatos ativos" value={active} hint={`${contacts.length} no total`} />
        <Stat label="Enviados" value={sent} hint={`teto hoje ${domain?.sentToday}/${domain?.dailyCap}`} />
        <Stat
          label="Saude"
          value={`${(100 * (domain?.bounceRate || 0)).toFixed(1)}%`}
          hint={`complaint ${(100 * (domain?.complaintRate || 0)).toFixed(3)}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Campanhas</h2>
            <Link href="/app/campaigns/new" className="text-xs font-medium text-gold-400 hover:text-gold-300">
              Nova
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-cream/40">Nenhuma campanha ainda.</p>
          ) : (
            <ul className="space-y-3">
              {campaigns.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between border-t border-ink-400 pt-3 first:border-0 first:pt-0">
                  <Link href={`/app/campaigns/${c.id}`} className="hover:text-gold-400">
                    {c.name}
                  </Link>
                  <Badge tone={c.status === "sent" ? "ok" : c.status === "blocked" ? "danger" : "gold"}>
                    {c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Sequencias</h2>
            <Link href="/app/sequences/new" className="text-xs font-medium text-gold-400 hover:text-gold-300">
              Nova
            </Link>
          </div>
          {sequences.length === 0 ? (
            <p className="text-sm text-cream/40">Nenhuma sequencia. Enrollment e sempre manual.</p>
          ) : (
            <ul className="space-y-3">
              {sequences.map((s) => (
                <li key={s.id} className="flex items-center justify-between border-t border-ink-400 pt-3 first:border-0 first:pt-0">
                  <Link href={`/app/sequences/${s.id}`} className="hover:text-gold-400">
                    {s.name}
                  </Link>
                  <Badge>{s.steps.length} passos</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
