import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { readDb } from "@/lib/store";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: { tab?: string; workspaceId?: string; status?: string };
}) {
  const tab = searchParams.tab === "audit" ? "audit" : searchParams.tab === "events" ? "events" : "jobs";
  const db = readDb();
  const workspaceId = searchParams.workspaceId || "";
  const status = searchParams.status || "";
  const jobs = db.jobs
    .filter((j) => (!workspaceId || j.workspaceId === workspaceId) && (!status || j.status === status))
    .slice(-200)
    .reverse();
  const events = db.events
    .filter((e) => !workspaceId || e.workspaceId === workspaceId)
    .slice(-200)
    .reverse();
  const audit = [...db.audit].reverse().slice(0, 200);

  const tabs = [
    { id: "jobs", label: "Fila" },
    { id: "events", label: "Eventos" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div>
      <PageHeader
        kicker="Operacao"
        title="Logs"
        subtitle="Falhas da fila, eventos Mailgun e o que o admin fez."
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={`/admin/logs?tab=${item.id}`}
            className={`btn ${tab === item.id ? "btn-primary" : "btn-secondary"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "jobs" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Para</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const ws = db.workspaces.find((w) => w.id === job.workspaceId);
                return (
                  <tr key={job.id} className="border-t border-ink-400">
                    <td className="px-4 py-3 font-mono text-xs text-cream/50">{job.sentAt || job.scheduledAt}</td>
                    <td className="px-4 py-3">{ws?.name || job.workspaceId}</td>
                    <td className="px-4 py-3 font-mono text-xs">{job.to}</td>
                    <td className="px-4 py-3">{job.type}</td>
                    <td className="px-4 py-3">
                      <Badge tone={job.status === "failed" ? "danger" : job.status === "sent" ? "ok" : "gold"}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-cream/40">{job.skipReason || job.providerId || "—"}</td>
                  </tr>
                );
              })}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-cream/40">
                    Nenhum job.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "events" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contato</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const ws = db.workspaces.find((w) => w.id === event.workspaceId);
                return (
                  <tr key={event.id} className="border-t border-ink-400">
                    <td className="px-4 py-3 font-mono text-xs text-cream/50">{event.createdAt}</td>
                    <td className="px-4 py-3">{ws?.name || event.workspaceId}</td>
                    <td className="px-4 py-3">
                      <Badge>{event.type}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{event.contactId || "—"}</td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-cream/40">
                    Nenhum evento.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Acao</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Alvo</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => {
                const actor = db.users.find((u) => u.id === row.actorUserId);
                return (
                  <tr key={row.id} className="border-t border-ink-400">
                    <td className="px-4 py-3 font-mono text-xs text-cream/50">{row.createdAt}</td>
                    <td className="px-4 py-3">{row.action}</td>
                    <td className="px-4 py-3">{actor?.name || row.actorUserId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-cream/50">
                      {row.targetUserId || row.workspaceId || "—"}
                    </td>
                  </tr>
                );
              })}
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-cream/40">
                    Sem audit ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
