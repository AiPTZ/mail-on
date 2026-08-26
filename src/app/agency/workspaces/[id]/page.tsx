import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function WorkspaceAgencyPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  const db = readDb();
  const workspace = db.workspaces.find((w) => w.id === params.id && w.agencyId === session?.agencyId);
  if (!workspace) notFound();
  const domain = db.domains.find((d) => d.workspaceId === workspace.id);
  const user = db.users.find((u) => u.workspaceId === workspace.id && u.role === "workspace");

  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title={workspace.name}
        subtitle="Somente leitura. O administrador provisiona DNS e acessos."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="label">Dominio</p>
          <p className="mt-2 font-mono text-sm">{domain?.domain || "—"}</p>
          <div className="mt-3">
            <Badge tone={domain?.status === "verified" ? "ok" : domain?.status === "failed" ? "danger" : "warn"}>
              {domain?.status || "ausente"}
            </Badge>
          </div>
        </div>
        <div className="panel p-5">
          <p className="label">Remetente</p>
          <p className="mt-2 font-serif text-xl">{domain?.fromName}</p>
          <p className="mt-1 font-mono text-xs text-cream/70">{domain?.fromEmail}</p>
        </div>
        <div className="panel p-5">
          <p className="label">Acesso do cliente</p>
          <p className="mt-2 text-sm">{user?.email || "—"}</p>
        </div>
      </div>
    </div>
  );
}
