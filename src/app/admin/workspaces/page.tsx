import Link from "next/link";
import { impersonateWorkspace } from "@/lib/actions";
import { Badge, Button, PageHeader } from "@/components/ui";
import { readDb } from "@/lib/store";

export default async function AdminWorkspacesPage() {
  const db = readDb();
  return (
    <div>
      <PageHeader
        kicker="Clientes"
        title="Workspaces"
        subtitle="Cada cliente envia do dominio dele. Voce autentica o DNS e libera o acesso."
        actions={
          <Link href="/admin/workspaces/new" className="btn btn-primary">
            Novo cliente
          </Link>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
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
            {db.workspaces.map((ws) => {
              const domain = db.domains.find((d) => d.workspaceId === ws.id);
              const tone = domain?.status === "verified" ? "ok" : domain?.status === "failed" ? "danger" : "warn";
              return (
                <tr key={ws.id} className="border-t border-ink-400">
                  <td className="px-4 py-4">
                    <Link href={`/admin/workspaces/${ws.id}`} className="text-cream hover:text-gold-400">
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
