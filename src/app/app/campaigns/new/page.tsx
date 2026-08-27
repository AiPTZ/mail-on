import { createCampaignAction } from "@/lib/actions";
import { ContactPicker } from "@/components/contact-picker";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function NewCampaignPage() {
  const session = await getSession();
  const db = readDb();
  const lists = db.lists.filter((l) => l.workspaceId === session!.workspaceId);
  const templates = db.templates.filter((t) => t.workspaceId === session!.workspaceId);
  const contacts = db.contacts
    .filter((c) => c.workspaceId === session!.workspaceId)
    .map((c) => ({
      id: c.id,
      listId: c.listId,
      email: c.email,
      name: c.name,
      status: c.status,
    }));

  return (
    <div className="max-w-xl">
      <PageHeader
        kicker="Campanha"
        title="Novo disparo"
        subtitle="Escolha quem recebe. Contatos suprimidos nao entram. So sai se o dominio estiver verificado."
      />
      <form action={createCampaignAction} className="panel space-y-5 p-6">
        <Field label="Nome interno">
          <Input name="name" required placeholder="Outono 01" />
        </Field>
        <Field label="Assunto">
          <Input name="subject" required placeholder="A colecao chegou" />
        </Field>
        <Field label="Pre-header">
          <Input name="previewText" placeholder="Pecas sob medida" />
        </Field>
        <ContactPicker lists={lists} contacts={contacts} />
        <Field label="Template">
          <Select name="templateId" required>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agendar (opcional)" hint="Deixe vazio e marque enviar agora.">
          <Input name="scheduledAt" type="datetime-local" />
        </Field>
        <label className="flex items-center gap-3 text-sm text-cream/70">
          <input type="checkbox" name="sendNow" value="1" defaultChecked className="h-4 w-4 accent-gold-500" />
          Enviar agora (respeita warmup)
        </label>
        <Button type="submit">Criar campanha</Button>
      </form>
    </div>
  );
}
