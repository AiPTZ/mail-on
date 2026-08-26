import { createWorkspaceAction } from "@/lib/actions";
import { Button, Field, Input, PageHeader } from "@/components/ui";

export default function NewWorkspacePage() {
  return (
    <div className="max-w-xl">
      <PageHeader
        kicker="Onboarding"
        title="Novo cliente"
        subtitle="Crie o workspace e o dominio de envio. O cliente so entra depois que o DNS estiver verde."
      />
      <form action={createWorkspaceAction} className="panel space-y-5 p-6">
        <Field label="Nome do cliente">
          <Input name="name" required placeholder="Atelier Aurora" />
        </Field>
        <Field label="Email de acesso do cliente">
          <Input name="email" type="email" required placeholder="olivia.t@example.org" />
        </Field>
        <Field label="Senha inicial" hint="O cliente troca depois. Demo aceita qualquer senha forte o suficiente.">
          <Input name="password" type="text" defaultValue="cliente123" />
        </Field>
        <Field
          label="Subdominio de envio"
          hint="Nunca o dominio raiz. Use mail.cliente.com ou news.cliente.com."
        >
          <Input name="domain" required placeholder="mail.cliente.com" />
        </Field>
        <Field label="Nome do remetente">
          <Input name="fromName" placeholder="Atelier Aurora" />
        </Field>
        <Button type="submit">Criar e gerar DNS</Button>
      </form>
    </div>
  );
}
