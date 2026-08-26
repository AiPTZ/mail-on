"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "./ui";

type EditorApi = {
  loadDesign: (design: unknown) => void;
  saveDesign: (cb: (design: unknown) => void) => void;
  exportHtml: (cb: (data: { html: string }) => void) => void;
};

declare global {
  interface Window {
    unlayer?: {
      init: (opts: Record<string, unknown>) => void;
      addEventListener: (name: string, cb: () => void) => void;
      loadDesign: EditorApi["loadDesign"];
      saveDesign: EditorApi["saveDesign"];
      exportHtml: EditorApi["exportHtml"];
    };
  }
}

export function UnlayerEditor({
  templateId,
  initialName,
  initialDesign,
  action,
}: {
  templateId?: string;
  initialName: string;
  initialDesign: unknown;
  action: (input: {
    id?: string;
    name: string;
    html: string;
    designJson: unknown;
  }) => Promise<{ id?: string }>;
}) {
  const ready = useRef(false);
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = document.getElementById("unlayer-script") as HTMLScriptElement | null;
    const boot = () => {
      if (!window.unlayer || ready.current) return;
      const el = document.getElementById("mailon-editor");
      const height = Math.max(el?.clientHeight || 0, Math.round(window.innerHeight - 220), 780);
      if (el) el.style.height = `${height}px`;
      window.unlayer.init({
        id: "mailon-editor",
        displayMode: "email",
        appearance: {
          theme: "dark",
          panels: { tools: { dock: "left" } },
        },
        locale: "pt-BR",
        minHeight: height,
      });
      window.unlayer.addEventListener("editor:ready", () => {
        if (initialDesign) window.unlayer?.loadDesign(initialDesign);
      });
      ready.current = true;
    };

    if (existing) {
      if (window.unlayer) boot();
      else existing.addEventListener("load", boot);
      return;
    }

    const script = document.createElement("script");
    script.id = "unlayer-script";
    script.src = "https://editor.unlayer.com/embed.js";
    script.async = true;
    script.onload = boot;
    document.body.appendChild(script);
  }, [initialDesign]);

  async function save() {
    if (!window.unlayer) {
      setStatus("Editor ainda carregando.");
      return;
    }
    setSaving(true);
    window.unlayer.saveDesign((design) => {
      window.unlayer?.exportHtml(async ({ html }) => {
        try {
          const result = await action({ id: templateId, name, html, designJson: design });
          setStatus("Template salvo.");
          if (result.id && result.id !== templateId) {
            router.push(`/app/templates/${result.id}`);
            router.refresh();
          } else {
            router.refresh();
          }
        } catch {
          setStatus("Nao foi possivel salvar.");
        } finally {
          setSaving(false);
        }
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Nome do template">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar template"}
        </Button>
      </div>
      {status ? <p className="text-sm text-cream/70">{status}</p> : null}
      <div
        id="mailon-editor"
        className="h-[calc(100dvh-13rem)] min-h-[780px] w-full rounded-2xl border border-ink-400 bg-ink-800 [&_iframe]:h-full [&_iframe]:min-h-[780px] [&_iframe]:w-full"
      />
    </div>
  );
}
