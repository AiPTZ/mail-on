"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export function NavLink({
  href,
  label,
  icon: Icon,
  end,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        active ? "gold-nav-active text-gold-400" : "text-cream/55 hover:bg-ink-600 hover:text-cream"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </Link>
  );
}
