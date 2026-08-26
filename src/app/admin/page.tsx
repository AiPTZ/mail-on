import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { readDb } from "@/lib/store";

export default async function AdminHome() {
  const db = readDb();
  const activeUsers = db.users.filter((u) => u.status !== "disabled").length;
  const verified = db.domains.filter((d) => d.status === "verified").length;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const failed24h = db.jobs.filter((j) => j.status === "failed" && new Date(j.scheduledAt).getTime() >= dayAgo).length;
  const queued = db.jobs.filter((j) => j.status === "queued").length;

  return (
    <div>
      <PageHeader
        kicker="Administracao"
        title="Visao geral"
        subtitle="Usuarios, dominios autenticados e a fila. So voce configura DNS e acessos."
        actions={
          <Link href="/admin/logs" className="btn btn-secondary">
            Ver logs
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usuarios ativos" value={activeUsers} />
        <Stat label="Dominios verificados" value={verified} />
        <Stat label="Falhas 24h" value={failed24h} />
        <Stat label="Fila" value={queued} />
      </div>
    </div>
  );
}
