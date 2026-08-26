"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Menu,
  Plus,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction, processQueueAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/types";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { Button } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  "/agency": Building2,
  "/agency/new": Plus,
  "/app": LayoutDashboard,
  "/app/audience": Users,
  "/app/templates": Mail,
  "/app/campaigns": List,
  "/app/sequences": Workflow,
};

function SidebarContent({
  user,
  items,
  cta,
  onNavigate,
}: {
  user: SessionUser;
  items: { href: string; label: string }[];
  cta?: { href: string; label: string };
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={ICONS[item.href] || List}
            end={item.href === "/agency" || item.href === "/app"}
            onClick={onNavigate}
          />
        ))}
      </nav>
      <div className="space-y-3 px-3 pb-5">
        {cta ? (
          <Link href={cta.href} onClick={onNavigate} className="btn btn-primary w-full">
            <Plus className="h-4 w-4" />
            {cta.label}
          </Link>
        ) : null}
        <form action={processQueueAction}>
          <Button variant="line" type="submit" className="w-full">
            Processar fila
          </Button>
        </form>
        <div className="rounded-xl border border-ink-400 bg-ink-800/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-cream">{user.name}</div>
              <div className="truncate text-xs text-cream/40">{user.email}</div>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-secondary !p-2" aria-label="Sair" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Shell({
  user,
  items,
  title,
  cta,
  children,
}: {
  user: SessionUser;
  items: { href: string; label: string }[];
  title: string;
  cta?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-ink-400 bg-ink-800/80 backdrop-blur lg:block">
        <SidebarContent user={user} items={items} cta={cta} />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-400 bg-ink-800/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size="sm" />
        <button
          type="button"
          className="btn btn-secondary !p-2"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 bg-ink-800 shadow-2xl">
            <button
              type="button"
              className="btn btn-secondary absolute right-3 top-4 !p-2"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent user={user} items={items} cta={cta} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[88rem]">
          <p className="mb-4 hidden text-xs uppercase tracking-[0.18em] text-cream/35 lg:block">{title}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
