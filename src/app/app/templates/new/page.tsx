import { UnlayerEditor } from "@/components/unlayer-editor";
import { PageHeader } from "@/components/ui";
import { saveTemplateAction } from "@/lib/actions";

export default function NewTemplatePage() {
  return (
    <div>
      <PageHeader kicker="Unlayer" title="Novo template" subtitle="Arraste blocos. Salve. Use em campanha ou sequencia." />
      <UnlayerEditor initialName="Novo email" initialDesign={null} action={saveTemplateAction} />
    </div>
  );
}
