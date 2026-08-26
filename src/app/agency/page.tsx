import Link from "next/link";
import { impersonateWorkspace } from "@/lib/actions";
import { Badge, Button, PageHeader, Stat } from "@/components/ui";
import { readDb } from "@/lib/store";
import { getSession } from "@/lib/auth";

export default async function AgencyHome() {
  const session = await getSession();
  const db = readDb();
  const workspaces = db.workspaces.filter((w) => w.agencyId === session?.agencyId);
  const verified = workspaces.filter((w) => db.domains.find((d) => d.workspaceId === w.id)?.status === "verified").length;
  const sent = db.jobs.filter((j) => j.status === "sent" && workspaces.some((w) => w.id === j.workspaceId)).length;

  return (
    <div>
      <PageHeader
        kicker="Agencia"
        title="Workspaces"
        subtitle="Cada cliente envia do dominio dele. Voce autentica o DNS. O cliente edita e dispara."
        actions={
          <Link href="/agency/new" className="btn btn-primary">
            Novo cliente
          </Link>
        }
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Clientes" value={workspaces.length} />
        <Stat label="Dominios verificados" value={verified} />
        <Stat label="Emails enviados" value={sent} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Dominio</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Warmup</th>
              <th className="px-4 py-3">Saude</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws) => {
              const domain = db.domains.find((d) => d.workspaceId === ws.id);
              const tone =
                domain?.status === "verified" ? "ok" : domain?.status === "failed" ? "danger" : "warn";
              return (
                <tr key={ws.id} className="border-t border-ink-400">
                  <td className="px-4 py-4">
                    <Link href={`/agency/workspaces/${ws.id}`} className="text-cream hover:text-gold-400">
                      {ws.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-cream/70">{domain?.domain || "—"}</td>
                  <td className="px-4 py-4">
                    <Badge tone={tone}>{domain?.status || "ausente"}</Badge>
                  </td>
                  <td className="px-4 py-4 text-cream/70">
                    dia {domain?.warmupDay ?? 0} · {domain?.sentToday ?? 0}/{domain?.dailyCap ?? 0}
                  </td>
                  <td className="px-4 py-4 text-xs text-cream/40">
                    bounce {(100 * (domain?.bounceRate || 0)).toFixed(2)}% · complaint{" "}
                    {(100 * (domain?.complaintRate || 0)).toFixed(3)}%
                  </td>
                  <td className="px-4 py-4 text-right">
                    <form action={impersonateWorkspace.bind(null, ws.id)}>
                      <Button variant="line" type="submit">
                        Operar
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
