import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "gold",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "ghost" | "danger" | "line";
}) {
  const styles = {
    gold: "btn btn-primary",
    ghost: "btn btn-secondary",
    danger: "btn btn-danger",
    line: "btn btn-secondary",
  }[variant];
  return <button className={`${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-cream/40">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input py-3 ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}

export function Badge({
  tone = "gold",
  children,
}: {
  tone?: "gold" | "ok" | "warn" | "danger" | "muted";
  children: React.ReactNode;
}) {
  const map = {
    gold: "border-gold-500/40 text-gold-400 bg-gold-500/10",
    ok: "border-emerald-400/40 text-emerald-400 bg-emerald-500/10",
    warn: "border-amber-400/40 text-amber-400 bg-amber-500/10",
    danger: "border-red-400/40 text-red-400 bg-red-500/10",
    muted: "border-ink-400 text-cream/45 bg-ink-800/60",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="label !mb-0">{label}</p>
      <p className="mt-3 font-serif text-3xl gold-gradient-text">{value}</p>
      {hint ? <p className="mt-2 text-xs text-cream/40">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? <p className="label !text-gold-500/80">{kicker}</p> : null}
        <h1 className="font-serif text-3xl font-bold text-cream sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-cream/50">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
