import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const items = [
  { href: "/app", label: "Visao geral" },
  { href: "/app/sender", label: "Remetente" },
  { href: "/app/audience", label: "Listas" },
  { href: "/app/templates", label: "Templates" },
  { href: "/app/campaigns", label: "Campanhas" },
  { href: "/app/sequences", label: "Sequencias" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.workspaceId || (session.role !== "workspace" && !session.impersonating)) {
    redirect(session.role === "admin" ? "/admin" : "/agency");
  }
  return (
    <Shell user={session} items={items} title="Workspace do cliente" cta={{ href: "/app/campaigns/new", label: "Nova campanha" }}>
      {children}
    </Shell>
  );
}
