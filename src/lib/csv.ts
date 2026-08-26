export type ContactRow = { email: string; name: string; tags: string[] };

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitTags(raw: string) {
  return raw
    .split(/[|,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (keys.includes(normalizeHeader(key))) return String(value ?? "").trim();
  }
  return "";
}

export function mapContactObjects(rows: Record<string, unknown>[]): ContactRow[] {
  return rows
    .map((row) => {
      const values = Object.values(row).map((v) => String(v ?? "").trim());
      const email = (pick(row, ["email", "e mail"]) || values[0] || "").toLowerCase();
      const name = pick(row, ["name", "nome"]) || values[1] || "";
      const tagsRaw = pick(row, ["tags", "tag"]) || values[2] || "";
      return { email, name, tags: splitTags(tagsRaw) };
    })
    .filter((r) => isEmail(r.email));
}

export function parseContactCsv(raw: string): ContactRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0]).map((h) => normalizeHeader(h));
  const emailIdx = header.findIndex((h) => h === "email" || h === "e mail");
  const nameIdx = header.findIndex((h) => h === "name" || h === "nome");
  const tagsIdx = header.findIndex((h) => h === "tags" || h === "tag");
  const rows = emailIdx >= 0 ? lines.slice(1) : lines;

  return rows
    .map((line) => {
      const cols = splitCsvLine(line);
      const email = (emailIdx >= 0 ? cols[emailIdx] : cols[0] || "").trim().toLowerCase();
      const name = (nameIdx >= 0 ? cols[nameIdx] : cols[1] || "").trim();
      const tagsRaw = tagsIdx >= 0 ? cols[tagsIdx] : cols[2] || "";
      return { email, name, tags: splitTags(tagsRaw) };
    })
    .filter((r) => isEmail(r.email));
}

export async function parseContactFile(fileName: string, bytes: Buffer): Promise<ContactRow[]> {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: "",
      raw: false,
    });
    return mapContactObjects(rows);
  }
  return parseContactCsv(bytes.toString("utf8"));
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
