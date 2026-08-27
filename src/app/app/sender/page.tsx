import { updateFromAction } from "@/lib/actions";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function SenderPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await getSession();
  const domain = readDb().domains.find((d) => d.workspaceId === session!.workspaceId);
  const local = domain?.fromEmail?.split("@")[0] || "ola";
  const error = searchParams?.error;
  const ok = searchParams?.ok;

  return (
    <div className="max-w-xl">
      <PageHeader
        kicker="Remetente"
        title="Quem envia e quem recebe a resposta"
        subtitle="O From fica no dominio autenticado. Reply-To pode ser qualquer caixa sua."
      />
      {ok ? (
        <p className="mb-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-cream">
          Remetente atualizado. Os proximos disparos usam estes enderecos.
        </p>
      ) : null}
      {error === "from" ? (
        <p className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-cream">
          Use so a parte local (ex. ola, vendas). O host e sempre @{domain?.domain}.
        </p>
      ) : null}
      {error === "reply" ? (
        <p className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-cream">
          Reply-To precisa ser um email valido.
        </p>
      ) : null}
      <form action={updateFromAction} className="panel space-y-5 p-6">
        <Field label="Nome que aparece no From">
          <Input name="fromName" defaultValue={domain?.fromName || ""} required placeholder="Atelier Aurora" />
        </Field>
        <Field
          label="Email de envio"
          hint={`So a parte antes do @. Sai como {local}@${domain?.domain || "dominio"}.`}
        >
          <div className="flex items-center gap-2">
            <Input name="fromLocal" defaultValue={local} required placeholder="ola" className="flex-1" />
            <span className="shrink-0 font-mono text-xs text-cream/50">@{domain?.domain}</span>
          </div>
        </Field>
        <Field
          label="Respostas vao para"
          hint="Para contar respostas na campanha, use um endereco @ do dominio de envio. Deixe vazio para responder no From."
        >
          <Input
            name="replyTo"
            type="email"
            defaultValue={domain?.replyTo || ""}
            placeholder="contato@suaempresa.com"
          />
        </Field>
        <p className="text-xs text-cream/40">
          From atual: {domain?.fromEmail || "—"}. Dominio {domain?.status || "pendente"}.
        </p>
        <Button type="submit">Salvar remetente</Button>
      </form>
    </div>
  );
}
