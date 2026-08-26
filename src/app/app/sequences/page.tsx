import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function SequencesPage() {
  const session = await getSession();
  const sequences = readDb().sequences.filter((s) => s.workspaceId === session!.workspaceId);

  return (
    <div>
      <PageHeader
        kicker="Nutricao"
        title="Sequencias"
        subtitle="Ate 3 emails. O cliente escolhe a lista e clica em iniciar. Ninguem entra sozinho."
        actions={
          <Link
            href="/app/sequences/new"
            className="btn btn-primary"
          >
            Nova sequencia
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {sequences.map((s) => (
          <Link key={s.id} href={`/app/sequences/${s.id}`} className="card block p-5 hover:border-gold-500/40">
            <div className="flex items-center justify-between">
              <p className="font-serif text-2xl">{s.name}</p>
              <Badge>{s.status}</Badge>
            </div>
            <p className="mt-3 text-sm text-cream/40">{s.steps.length} passos</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
