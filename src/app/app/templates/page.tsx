import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function TemplatesPage() {
  const session = await getSession();
  const templates = readDb().templates.filter((t) => t.workspaceId === session!.workspaceId);

  return (
    <div>
      <PageHeader
        kicker="Editor"
        title="Templates"
        subtitle="Unlayer embutido. O HTML final fica no Mail ON, nao no Mailgun."
        actions={
          <Link
            href="/app/templates/new"
            className="btn btn-primary"
          >
            Novo template
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Link key={t.id} href={`/app/templates/${t.id}`} className="card block p-5 hover:border-gold-500/40">
            <p className="font-serif text-2xl">{t.name}</p>
            <p className="mt-2 text-xs text-cream/40">
              Atualizado {new Date(t.updatedAt).toLocaleString("pt-BR")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
