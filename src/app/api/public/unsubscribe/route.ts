import { NextRequest, NextResponse } from "next/server";
import { suppressContact } from "@/lib/worker";

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("w") || "";
  const contactId = request.nextUrl.searchParams.get("c") || "";
  const { readDb } = await import("@/lib/store");
  const contact = readDb().contacts.find((c) => c.id === contactId && c.workspaceId === workspaceId);
  if (contact) suppressContact(workspaceId, contact.email, "unsubscribe");

  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><body style="background:#0B0B0B;color:#F5E6C8;font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;margin:0;"><div style="text-align:center;max-width:420px;padding:24px;"><p style="letter-spacing:.28em;text-transform:uppercase;color:#C9A227;font-size:12px;">Mail ON</p><h1>Inscricao encerrada.</h1><p style="color:#D9C89A;">Voce nao recebera mais campanhas deste remetente.</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
