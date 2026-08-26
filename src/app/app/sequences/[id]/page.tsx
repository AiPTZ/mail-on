import { notFound } from "next/navigation";
import { startSequenceAction } from "@/lib/actions";
import { Badge, Button, Field, PageHeader, Select, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function SequenceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const session = await getSession();
  const db = readDb();
  const sequence = db.sequences.find((s) => s.id === id && s.workspaceId === session?.workspaceId);
  if (!sequence) notFound();
  const lists = db.lists.filter((l) => l.workspaceId === session!.workspaceId);
  const enrollments = db.enrollments.filter((e) => e.sequenceId === sequence.id);
  const templates = db.templates.filter((t) => t.workspaceId === session!.workspaceId);

  return (
    <div>
      <PageHeader kicker="Sequencia" title={sequence.name} subtitle="Enrollment manual. Contato que bounceou nao entra." />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Status" value={sequence.status} />
        <Stat label="Inscritos" value={enrollments.length} />
        <Stat label="Ativos" value={enrollments.filter((e) => e.status === "active").length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          {sequence.steps
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((step) => (
              <article key={step.id} className="panel p-5">
                <p className="label !text-gold-500/80">Passo 0{step.order}</p>
                <p className="mt-2 font-serif text-2xl">{step.subject}</p>
                <p className="mt-2 text-sm text-cream/40">
                  espera {step.delayDays}d · {templates.find((t) => t.id === step.templateId)?.name}
                </p>
              </article>
            ))}
        </section>
        <form action={startSequenceAction} className="panel h-fit space-y-4 p-6">
          <h2 className="font-serif text-2xl">Iniciar na lista</h2>
          <input type="hidden" name="sequenceId" value={sequence.id} />
          <Field label="Lista">
            <Select name="listId" required>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Matricular agora</Button>
          <p className="text-xs leading-5 text-cream/40">
            Quem ja esta na sequencia nao entra de novo. Quem esta suprimido e ignorado.
          </p>
        </form>
      </div>

      <div className="card mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Passo</th>
              <th className="px-4 py-3">Proximo</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => {
              const contact = db.contacts.find((c) => c.id === e.contactId);
              return (
                <tr key={e.id} className="border-t border-ink-400">
                  <td className="px-4 py-3 font-mono text-xs">{contact?.email}</td>
                  <td className="px-4 py-3">{e.currentStep}</td>
                  <td className="px-4 py-3 text-cream/40">
                    {new Date(e.nextRunAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{e.status}</Badge>
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
