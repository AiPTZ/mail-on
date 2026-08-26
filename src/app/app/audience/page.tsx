import { createListAction, importCsvAction } from "@/lib/actions";
import { Badge, Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function AudiencePage() {
  const session = await getSession();
  const db = readDb();
  const workspaceId = session!.workspaceId!;
  const lists = db.lists.filter((l) => l.workspaceId === workspaceId);
  const contacts = db.contacts.filter((c) => c.workspaceId === workspaceId);

  return (
    <div>
      <PageHeader
        kicker="Base"
        title="Listas e contatos"
        subtitle="Importe XLSX ou CSV. Colunas: email, nome, tags. Contatos com bounce ou complaint saem sozinhos."
      />
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <form action={createListAction} className="panel space-y-4 p-6">
          <h2 className="font-serif text-2xl">Nova lista</h2>
          <Field label="Nome">
            <Input name="name" required placeholder="Clientes VIP" />
          </Field>
          <Button type="submit">Criar lista</Button>
        </form>
        <form action={importCsvAction} className="panel space-y-4 p-6">
          <h2 className="font-serif text-2xl">Importar planilha</h2>
          <p className="text-sm text-cream/50">
            Baixe o modelo, preencha e envie. Aceita .xlsx e .csv.
          </p>
          <a
            href="/modelo-contatos.xlsx"
            className="inline-flex text-sm font-medium text-gold-400 hover:text-gold-300"
          >
            Baixar modelo XLSX
          </a>
          <Field label="Lista">
            <Select name="listId" required defaultValue={lists[0]?.id}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Arquivo" hint="email, nome, tags">
            <Input
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              required
            />
          </Field>
          <Button type="submit">Importar</Button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-ink-800/80 text-[11px] uppercase tracking-[0.16em] text-cream/35">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Lista</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Origem</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-ink-400">
                <td className="px-4 py-3 font-mono text-xs">{c.email}</td>
                <td className="px-4 py-3">{c.name || "—"}</td>
                <td className="px-4 py-3 text-cream/70">
                  {lists.find((l) => l.id === c.listId)?.name}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "active" ? "ok" : "danger"}>
                    {c.suppressReason || c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-cream/40">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
