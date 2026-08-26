import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const items = [
  { href: "/agency", label: "Workspaces" },
  { href: "/agency/new", label: "Novo cliente" },
];

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "agency") redirect("/app");
  return (
    <Shell user={session} items={items} title="Painel da agencia" cta={{ href: "/agency/new", label: "Novo cliente" }}>
      {children}
    </Shell>
  );
}
