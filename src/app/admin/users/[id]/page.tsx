import { notFound } from "next/navigation";
import { updateUserAction } from "@/lib/actions";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { readDb } from "@/lib/store";

export default function EditUserPage({ params }: { params: { id: string } }) {
  const db = readDb();
  const user = db.users.find((u) => u.id === params.id);
  if (!user) notFound();
  return (
    <div className="max-w-xl">
      <PageHeader kicker="Acessos" title={user.name} subtitle="Edite o acesso. Deixe a senha em branco para manter." />
      <form action={updateUserAction} className="panel space-y-5 p-6">
        <input type="hidden" name="userId" value={user.id} />
        <Field label="Nome">
          <Input name="name" required defaultValue={user.name} />
        </Field>
        <Field label="Email de acesso">
          <Input name="email" type="email" required defaultValue={user.email} />
        </Field>
        <Field label="Nova senha" hint="Vazio = nao altera.">
          <Input name="password" type="text" placeholder="••••••••" />
        </Field>
        <Field label="Papel">
          <Select name="role" defaultValue={user.role}>
            <option value="workspace">workspace</option>
            <option value="agency">agency</option>
            <option value="admin">admin</option>
          </Select>
        </Field>
        <Field label="Workspace">
          <Select name="workspaceId" defaultValue={user.workspaceId || ""}>
            <option value="">—</option>
            {db.workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={user.status || "active"}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </Select>
        </Field>
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  );
}
