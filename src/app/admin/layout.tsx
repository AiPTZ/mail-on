import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const items = [
  { href: "/admin", label: "Visao geral" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/logs", label: "Logs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.impersonating) redirect("/app");
  if (session.role !== "admin") redirect(session.role === "agency" ? "/agency" : "/app");
  return (
    <Shell user={session} items={items} title="Painel do administrador" cta={{ href: "/admin/workspaces/new", label: "Novo cliente" }}>
      {children}
    </Shell>
  );
}
