import { createUserAction } from "@/lib/actions";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { readDb } from "@/lib/store";

export default function NewUserPage({ searchParams }: { searchParams: { error?: string } }) {
  const workspaces = readDb().workspaces;
  return (
    <div className="max-w-xl">
      <PageHeader
        kicker="Acessos"
        title="Novo usuario"
        subtitle="O cliente recebe so o email e a senha. Dominio e DNS ficam no workspace."
      />
      {searchParams.error ? (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {searchParams.error === "taken" ? "Este login ja existe." : "Preencha nome, email e senha."}
        </p>
      ) : null}
      <form action={createUserAction} className="panel space-y-5 p-6">
        <Field label="Nome">
          <Input name="name" required placeholder="Marina Aurora" />
        </Field>
        <Field label="Email de acesso">
          <Input name="email" type="email" required placeholder="olivia.t@example.org" />
        </Field>
        <Field label="Senha inicial">
          <Input name="password" type="text" required defaultValue="cliente123" />
        </Field>
        <Field label="Papel">
          <Select name="role" defaultValue="workspace">
            <option value="workspace">workspace</option>
            <option value="agency">agency</option>
            <option value="admin">admin</option>
          </Select>
        </Field>
        <Field label="Workspace" hint="Obrigatorio para papel workspace.">
          <Select name="workspaceId" defaultValue="">
            <option value="">—</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Criar usuario</Button>
      </form>
    </div>
  );
}
