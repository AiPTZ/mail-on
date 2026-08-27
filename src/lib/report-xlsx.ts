import * as XLSX from "xlsx";
import type { Campaign, SendStats } from "./types";
import type { CampaignReportRow } from "./worker";

type ReportInput = {
  campaign: Campaign;
  stats: SendStats;
  rows: CampaignReportRow[];
};

function flag(value: boolean) {
  return value ? "Sim" : "Nao";
}

function pct(part: number, total: number) {
  if (!total) return "0,0%";
  return `${((100 * part) / total).toFixed(1).replace(".", ",")}%`;
}

function colWidth(chars: number) {
  return { wch: chars };
}

export function buildCampaignWorkbook(input: ReportInput): Buffer {
  const { campaign, stats, rows } = input;
  const sent = stats.sent || 0;
  const generatedAt = new Date().toLocaleString("pt-BR");
  const wb = XLSX.utils.book_new();

  const summaryAoA: (string | number)[][] = [
    ["MAIL ON"],
    ["Relatorio da campanha ate o momento"],
    [],
    ["Campanha", campaign.name],
    ["Assunto", campaign.subject],
    ["Status", campaign.status],
    ["Gerado em", generatedAt],
    [],
    ["Indicador", "Quantidade", "% dos enviados"],
    ["Enviados", stats.sent, pct(stats.sent, sent || 1)],
    ["Entregues", stats.delivered, pct(stats.delivered, sent)],
    ["Abertos", stats.opened, pct(stats.opened, sent)],
    ["Cliques", stats.clicked, pct(stats.clicked, sent)],
    ["Spam", stats.complained, pct(stats.complained, sent)],
    ["Respondidos", stats.replied || 0, pct(stats.replied || 0, sent)],
    ["Bounce", stats.bounced, pct(stats.bounced, sent)],
    ["Descadastros", stats.unsubscribed, pct(stats.unsubscribed, sent)],
    ["Na fila", stats.queued, ""],
    [],
    ["Contatos no recorte", rows.length],
    ["Abertos (unicos)", rows.filter((r) => r.opened).length],
    ["Spam (unicos)", rows.filter((r) => r.complained).length],
    ["Respondidos (unicos)", rows.filter((r) => r.replied).length],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryAoA);
  summary["!cols"] = [colWidth(28), colWidth(42), colWidth(18)];
  summary["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
  ];
  XLSX.utils.book_append_sheet(wb, summary, "Resumo");

  const contactAoA: (string | number)[][] = [
    ["Email", "Nome", "Enviado", "Entregue", "Aberto", "Clique", "Spam", "Respondido", "Bounce", "Motivo bounce", "Descadastro"],
    ...rows.map((row) => [
      row.email,
      row.name || "",
      flag(row.sent),
      flag(row.delivered),
      flag(row.opened),
      flag(row.clicked),
      flag(row.complained),
      flag(row.replied),
      flag(row.bounced),
      row.bounceReason || "",
      flag(row.unsubscribed),
    ]),
  ];
  const contacts = XLSX.utils.aoa_to_sheet(contactAoA);
  contacts["!cols"] = [
    colWidth(32),
    colWidth(24),
    colWidth(12),
    colWidth(12),
    colWidth(12),
    colWidth(12),
    colWidth(12),
    colWidth(14),
    colWidth(12),
    colWidth(28),
    colWidth(14),
  ];
  contacts["!autofilter"] = { ref: `A1:K${Math.max(1, rows.length + 1)}` };
  XLSX.utils.book_append_sheet(wb, contacts, "Contatos");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
