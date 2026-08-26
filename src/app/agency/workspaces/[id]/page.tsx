import { notFound } from "next/navigation";
import { impersonateWorkspace, verifyDomainAction } from "@/lib/actions";
import { Badge, Button, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function WorkspaceAdminPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const session = await getSession();
  const db = readDb();
  const workspace = db.workspaces.find((w) => w.id === id && w.agencyId === session?.agencyId);
  if (!workspace) notFound();
  const domain = db.domains.find((d) => d.workspaceId === workspace.id);
  const user = db.users.find((u) => u.workspaceId === workspace.id);
  const lists = db.lists.filter((l) => l.workspaceId === workspace.id).length;
  const contacts = db.contacts.filter((c) => c.workspaceId === workspace.id).length;

  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title={workspace.name}
        subtitle="Cole estes registros no DNS do cliente. So libere o disparo quando o status estiver verificado."
        actions={
          <form action={impersonateWorkspace.bind(null, workspace.id)}>
            <Button type="submit">Abrir como cliente</Button>
          </form>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl">DNS de autenticacao</h2>
            {domain ? (
              <Badge tone={domain.status === "verified" ? "ok" : domain.status === "failed" ? "danger" : "warn"}>
                {domain.status}
              </Badge>
            ) : null}
          </div>
          {!domain ? (
            <p className="text-sm text-cream/40">Nenhum dominio provisionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.16em] text-cream/35">
                  <tr>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Host</th>
                    <th className="py-2 pr-4">Valor</th>
                    <th className="py-2">Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {domain.dnsRecords.map((r) => (
                    <tr key={`${r.host}-${r.purpose}`} className="border-t border-ink-400 align-top">
                      <td className="py-3 pr-4 font-mono text-xs">{r.type}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-cream/70">{r.host}</td>
                      <td className="py-3 pr-4 font-mono text-xs break-all text-cream">{r.value}</td>
                      <td className="py-3 uppercase tracking-[0.12em] text-[10px] text-cream/40">{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {domain ? (
            <form action={verifyDomainAction.bind(null, workspace.id)} className="mt-6">
              <Button type="submit" variant="line">
                Checar DNS agora
              </Button>
            </form>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="label">Remetente</p>
            <p className="mt-2 font-serif text-xl">{domain?.fromName}</p>
            <p className="mt-1 font-mono text-xs text-cream/70">{domain?.fromEmail}</p>
          </div>
          <div className="panel p-5">
            <p className="label">Acesso do cliente</p>
            <p className="mt-2 text-sm">{user?.email}</p>
          </div>
          <div className="panel p-5">
            <p className="label">Base</p>
            <p className="mt-2 text-sm">{lists} listas · {contacts} contatos</p>
          </div>
          <div className="panel p-5">
            <p className="label">Warmup</p>
            <p className="mt-2 font-serif text-2xl">
              {domain?.sentToday}/{domain?.dailyCap}
            </p>
            <p className="mt-1 text-xs text-cream/40">dia {domain?.warmupDay}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
