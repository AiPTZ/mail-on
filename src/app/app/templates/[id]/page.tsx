import { notFound } from "next/navigation";
import { UnlayerEditor } from "@/components/unlayer-editor";
import { PageHeader } from "@/components/ui";
import { saveTemplateAction } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { readDb } from "@/lib/store";

export default async function EditTemplatePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const session = await getSession();
  const template = readDb().templates.find(
    (t) => t.id === id && t.workspaceId === session?.workspaceId,
  );
  if (!template) notFound();

  return (
    <div>
      <PageHeader kicker="Unlayer" title={template.name} />
      <UnlayerEditor
        templateId={template.id}
        initialName={template.name}
        initialDesign={template.designJson}
        action={saveTemplateAction}
      />
    </div>
  );
}
