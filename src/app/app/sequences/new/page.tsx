import { createSequenceAction } from "@/lib/actions";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function NewSequencePage() {
  const session = await getSession();
  const templates = readDb().templates.filter((t) => t.workspaceId === session!.workspaceId);

  return (
    <div className="max-w-2xl">
      <PageHeader
        kicker="Sequencia"
        title="Ate tres emails"
        subtitle="Passo 1 pode sair no mesmo dia (delay 0). Os outros esperam N dias."
      />
      <form action={createSequenceAction} className="space-y-6">
        <div className="panel space-y-4 p-6">
          <Field label="Nome">
            <Input name="name" required placeholder="Boas-vindas VIP" />
          </Field>
        </div>
        {[1, 2, 3].map((order) => (
          <div key={order} className="panel space-y-4 p-6">
            <p className="label !text-gold-500/80">Passo 0{order}</p>
            <Field label="Assunto">
              <Input name={`step${order}Subject`} placeholder={order === 1 ? "Obrigatorio" : "Opcional"} required={order === 1} />
            </Field>
            <Field label="Template">
              <Select name={`step${order}Template`} required={order === 1} defaultValue="">
                <option value="">Selecionar</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Espera em dias" hint={order === 1 ? "0 envia na hora do enrollment." : "Dias apos o passo anterior."}>
              <Input name={`step${order}Delay`} type="number" min={0} defaultValue={order === 1 ? 0 : order === 2 ? 2 : 5} />
            </Field>
          </div>
        ))}
        <Button type="submit">Salvar sequencia</Button>
      </form>
    </div>
  );
}
