"use client";

import { useMemo, useState } from "react";

type ContactRow = {
  id: string;
  listId: string;
  email: string;
  name: string;
  status: "active" | "suppressed";
};

export function ContactPicker({
  lists,
  contacts,
}: {
  lists: { id: string; name: string }[];
  contacts: ContactRow[];
}) {
  const [listId, setListId] = useState(lists[0]?.id || "");
  const [query, setQuery] = useState("");
  const active = useMemo(
    () => contacts.filter((c) => c.listId === listId && c.status === "active"),
    [contacts, listId],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [active, query]);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const c of contacts.filter((row) => row.listId === (lists[0]?.id || "") && row.status === "active")) {
      next[c.id] = true;
    }
    return next;
  });

  function chooseList(id: string) {
    setListId(id);
    setQuery("");
    const next: Record<string, boolean> = {};
    for (const c of contacts.filter((row) => row.listId === id && row.status === "active")) {
      next[c.id] = true;
    }
    setSelected(next);
  }

  function toggleAll(on: boolean) {
    const next = { ...selected };
    for (const c of visible) next[c.id] = on;
    setSelected(next);
  }

  const chosen = visible.filter((c) => selected[c.id]).length;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Lista</span>
        <select
          name="listId"
          required
          className="input"
          value={listId}
          onChange={(e) => chooseList(e.target.value)}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {Object.entries(selected)
        .filter(([, on]) => on)
        .map(([id]) => (
          <input key={id} type="hidden" name="contactIds" value={id} />
        ))}
      <div className="rounded-xl border border-ink-400 bg-ink-900/40">
        <div className="flex flex-col gap-3 border-b border-ink-400 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-cream/70">
            {chosen} de {active.length} ativos selecionados
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => toggleAll(true)}>
              Todos visiveis
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => toggleAll(false)}>
              Nenhum
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por email ou nome"
            aria-label="Filtrar contatos"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-4 py-6 text-sm text-cream/40">Nenhum contato ativo nesta lista.</li>
          ) : (
            visible.map((c) => (
              <li key={c.id} className="border-t border-ink-400">
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-ink-800/50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-gold-500"
                    checked={Boolean(selected[c.id])}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-cream">{c.email}</span>
                    <span className="block text-cream/45">{c.name || "sem nome"}</span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
