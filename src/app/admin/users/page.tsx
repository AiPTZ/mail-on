import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { readDb } from "@/lib/store";

export default async function AdminUsersPage() {
  const db = readDb();
  return (
    <div>
      <PageHeader
        kicker="Acessos"
        title="Usuarios"
        subtitle="Crie, edite e desative. O historico de envio permanece."
        actions={
          <Link href="/admin/users/new" className="btn btn-primary">
            Novo usuario
          </Link>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {db.users.map((user) => {
              const ws = db.workspaces.find((w) => w.id === user.workspaceId);
              return (
                <tr key={user.id} className="border-t border-ink-400">
                  <td className="px-4 py-4">
                    <Link href={`/admin/users/${user.id}`} className="text-cream hover:text-gold-400">
                      {user.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-cream/70">{user.email}</td>
                  <td className="px-4 py-4">
                    <Badge>{user.role}</Badge>
                  </td>
                  <td className="px-4 py-4 text-cream/70">{ws?.name || "—"}</td>
                  <td className="px-4 py-4">
                    <Badge tone={user.status === "disabled" ? "danger" : "ok"}>{user.status || "active"}</Badge>
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
