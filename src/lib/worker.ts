import { emptyStats, readDb, writeDb, workspaceDomain } from "./store";
import { fetchDomainEvents, sendMessage } from "./mailgun";
import { canRaiseWarmup, warmupCapForDay } from "./warmup";
import { nid, todayStamp } from "./ids";
import type { Campaign, Contact, EventType, SendingDomain, SendJob } from "./types";

function resetDailyCounters(domain: SendingDomain) {
  const today = todayStamp();
  if (domain.sentTodayDate !== today) {
    if (canRaiseWarmup(domain.bounceRate, domain.complaintRate)) {
      domain.warmupDay += 1;
      domain.dailyCap = warmupCapForDay(domain.warmupDay);
    }
    domain.sentToday = 0;
    domain.sentTodayDate = today;
  }
}

function remainingCap(domain: SendingDomain) {
  resetDailyCounters(domain);
  return Math.max(0, domain.dailyCap - domain.sentToday);
}

function unsubscribeUrl(workspaceId: string, contactId: string) {
  return `/api/public/unsubscribe?w=${workspaceId}&c=${contactId}`;
}

function injectUnsubscribe(html: string, url: string) {
  return html.replaceAll("{{unsubscribe_url}}", url);
}

export function queueCampaign(campaignId: string) {
  writeDb((db) => {
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error("Campanha nao encontrada");
    const domain = db.domains.find((d) => d.workspaceId === campaign.workspaceId);
    if (!domain || domain.status !== "verified") {
      campaign.status = "blocked";
      campaign.blockedReason = "Dominio ainda nao autenticado. Peça a agencia para validar o DNS.";
      return;
    }
    const template = db.templates.find((t) => t.id === campaign.templateId);
    if (!template) throw new Error("Template nao encontrado");

    const alreadyQueued = db.jobs.some((j) => j.campaignId === campaign.id);
    if (alreadyQueued) {
      if (campaign.status === "draft" || campaign.status === "blocked") campaign.status = "sending";
      return;
    }
    const selected = campaign.contactIds ? new Set(campaign.contactIds) : null;
    const contacts = db.contacts.filter(
      (c) =>
        c.listId === campaign.listId &&
        c.status === "active" &&
        (!selected || selected.has(c.id)),
    );
    const now = new Date().toISOString();
    for (const contact of contacts) {
      db.jobs.push({
        id: nid("job"),
        workspaceId: campaign.workspaceId,
        type: "campaign",
        campaignId: campaign.id,
        contactId: contact.id,
        to: contact.email,
        subject: campaign.subject,
        html: template.html,
        status: "queued",
        scheduledAt: campaign.scheduledAt || now,
      });
    }
    campaign.stats.queued += contacts.length;
    campaign.status = campaign.scheduledAt && campaign.scheduledAt > now ? "scheduled" : "sending";
  });
}

export function enrollList(sequenceId: string, listId: string) {
  writeDb((db) => {
    const sequence = db.sequences.find((s) => s.id === sequenceId);
    if (!sequence) throw new Error("Sequencia nao encontrada");
    if (sequence.steps.length === 0) throw new Error("Sequencia sem passos");
    const domain = db.domains.find((d) => d.workspaceId === sequence.workspaceId);
    if (!domain || domain.status !== "verified") {
      throw new Error("Dominio nao autenticado");
    }

    const first = [...sequence.steps].sort((a, b) => a.order - b.order)[0];
    const contacts = db.contacts.filter((c) => c.listId === listId && c.status === "active");
    const already = new Set(
      db.enrollments
        .filter((e) => e.sequenceId === sequenceId)
        .map((e) => e.contactId),
    );
    const now = Date.now();

    for (const contact of contacts) {
      if (already.has(contact.id)) continue;
      db.enrollments.push({
        id: nid("enr"),
        workspaceId: sequence.workspaceId,
        sequenceId: sequence.id,
        contactId: contact.id,
        listId,
        currentStep: first.order,
        nextRunAt: new Date(now + first.delayDays * 86400000).toISOString(),
        status: "active",
        startedAt: new Date().toISOString(),
      });
    }
    sequence.status = "active";
  });
}

function queueDueSequenceSteps() {
  writeDb((db) => {
    const now = Date.now();
    for (const enrollment of db.enrollments) {
      if (enrollment.status !== "active") continue;
      if (new Date(enrollment.nextRunAt).getTime() > now) continue;
      const contact = db.contacts.find((c) => c.id === enrollment.contactId);
      const sequence = db.sequences.find((s) => s.id === enrollment.sequenceId);
      if (!contact || !sequence) {
        enrollment.status = "stopped";
        continue;
      }
      if (contact.status !== "active") {
        enrollment.status = "stopped";
        continue;
      }
      const step = sequence.steps.find((s) => s.order === enrollment.currentStep);
      if (!step) {
        enrollment.status = "completed";
        continue;
      }
      const template = db.templates.find((t) => t.id === step.templateId);
      if (!template) {
        enrollment.status = "stopped";
        continue;
      }
      const exists = db.jobs.some(
        (j) =>
          j.enrollmentId === enrollment.id &&
          j.stepId === step.id &&
          (j.status === "queued" || j.status === "sent"),
      );
      if (exists) continue;
      db.jobs.push({
        id: nid("job"),
        workspaceId: enrollment.workspaceId,
        type: "sequence",
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: contact.id,
        to: contact.email,
        subject: step.subject,
        html: template.html,
        status: "queued",
        scheduledAt: new Date().toISOString(),
      });
    }
  });
}

async function dispatchJob(job: SendJob, domain: SendingDomain, contact: Contact) {
  if (contact.status !== "active") {
    writeDb((db) => {
      const row = db.jobs.find((j) => j.id === job.id);
      if (row) {
        row.status = "skipped";
        row.skipReason = "contato suprimido";
      }
    });
    return;
  }

  const from = `${domain.fromName} <${domain.fromEmail}>`;
  const unsub = unsubscribeUrl(job.workspaceId, contact.id);
  const html = injectUnsubscribe(job.html, unsub);
  const providerId = await sendMessage({
    domain: domain.domain,
    from,
    to: contact.email,
    subject: job.subject,
    html,
    unsubscribeUrl: unsub,
    replyTo: domain.replyTo,
    jobId: job.id,
    campaignId: job.campaignId,
  });

  writeDb((db) => {
    const row = db.jobs.find((j) => j.id === job.id);
    const d = db.domains.find((x) => x.id === domain.id);
    if (row) {
      row.status = "sent";
      row.sentAt = new Date().toISOString();
      row.providerId = providerId;
    }
    if (d) {
      resetDailyCounters(d);
      d.sentToday += 1;
    }
    if (job.campaignId) {
      const campaign = db.campaigns.find((c) => c.id === job.campaignId);
      if (campaign) campaign.stats.sent += 1;
    }
    db.events.push({
      id: nid("evt"),
      workspaceId: job.workspaceId,
      contactId: contact.id,
      jobId: job.id,
      type: "delivered",
      createdAt: new Date().toISOString(),
    });
    if (job.campaignId) {
      const campaign = db.campaigns.find((c) => c.id === job.campaignId);
      if (campaign) campaign.stats.delivered += 1;
    }
    if (job.enrollmentId) {
      const enrollment = db.enrollments.find((e) => e.id === job.enrollmentId);
      const sequence = enrollment
        ? db.sequences.find((s) => s.id === enrollment.sequenceId)
        : undefined;
      advanceEnrollment(enrollment, sequence);
    }
  });
}

function advanceEnrollment(
  enrollment: { currentStep: number; nextRunAt: string; status: string } | undefined,
  sequence: { steps: { order: number; delayDays: number }[] } | undefined,
) {
  if (!enrollment || !sequence) return;
  const ordered = [...sequence.steps].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((s) => s.order === enrollment.currentStep);
  const next = ordered[idx + 1];
  if (!next) {
    enrollment.status = "completed";
    return;
  }
  enrollment.currentStep = next.order;
  enrollment.nextRunAt = new Date(Date.now() + next.delayDays * 86400000).toISOString();
}

export async function tickWorker() {
  queueDueSequenceSteps();
  const db = readDb();
  const due = db.jobs
    .filter((j) => j.status === "queued" && new Date(j.scheduledAt).getTime() <= Date.now())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const sentByWorkspace: Record<string, number> = {};
  let processed = 0;

  for (const job of due) {
    const domain = workspaceDomain(job.workspaceId);
    if (!domain || domain.status !== "verified") {
      writeDb((d) => {
        const row = d.jobs.find((j) => j.id === job.id);
        if (row) {
          row.status = "skipped";
          row.skipReason = "dominio nao verificado";
        }
      });
      continue;
    }
    resetDailyCounters(domain);
    const used = sentByWorkspace[job.workspaceId] || 0;
    if (used >= remainingCap(domain)) {
      if (job.campaignId) {
        writeDb((d) => {
          const campaign = d.campaigns.find((c) => c.id === job.campaignId);
          if (campaign && campaign.status === "sending") {
            campaign.blockedReason = `Teto diario ${domain.sentToday}/${domain.dailyCap}. O restante sai no proximo ciclo de warmup.`;
          }
        });
      }
      continue;
    }

    const contact = db.contacts.find((c) => c.id === job.contactId);
    if (!contact) {
      writeDb((d) => {
        const row = d.jobs.find((j) => j.id === job.id);
        if (row) {
          row.status = "skipped";
          row.skipReason = "contato removido";
        }
      });
      continue;
    }

    try {
      await dispatchJob(job, domain, contact);
      sentByWorkspace[job.workspaceId] = used + 1;
      processed += 1;
    } catch (error) {
      writeDb((d) => {
        const row = d.jobs.find((j) => j.id === job.id);
        if (row) {
          row.status = "failed";
          row.skipReason = error instanceof Error ? error.message : "falha no envio";
        }
      });
    }
  }

  writeDb((d) => {
    for (const campaign of d.campaigns) {
      finalizeCampaign(campaign, d.jobs.filter((j) => j.campaignId === campaign.id));
    }
  });

  return { processed };
}

function finalizeCampaign(campaign: Campaign, jobs: SendJob[]) {
  if (campaign.status !== "sending" && campaign.status !== "scheduled") return;
  if (jobs.length === 0) return;
  const pending = jobs.some((j) => j.status === "queued");
  if (!pending) {
    campaign.status = "sent";
    campaign.sentAt = new Date().toISOString();
  }
}

export function suppressContact(
  workspaceId: string,
  email: string,
  reason: "bounce" | "complaint" | "unsubscribe",
  opts?: { recordEvent?: boolean },
) {
  writeDb((db) => {
    applySuppress(db, workspaceId, email, reason, opts?.recordEvent !== false);
  });
}

function applySuppress(
  db: ReturnType<typeof readDb>,
  workspaceId: string,
  email: string,
  reason: "bounce" | "complaint" | "unsubscribe",
  recordEvent: boolean,
) {
  const contact = db.contacts.find(
    (c) => c.workspaceId === workspaceId && c.email.toLowerCase() === email.toLowerCase(),
  );
  if (!contact) return contact;
  contact.status = "suppressed";
  contact.suppressReason = reason;
  if (recordEvent) {
    db.events.push({
      id: nid("evt"),
      workspaceId,
      contactId: contact.id,
      type: reason === "bounce" ? "bounced" : reason === "complaint" ? "complained" : "unsubscribed",
      createdAt: new Date().toISOString(),
      meta: { email: contact.email.toLowerCase() },
    });
  }
  const domain = db.domains.find((d) => d.workspaceId === workspaceId);
  if (domain) {
    const total = Math.max(1, domain.sentToday + 20);
    if (reason === "bounce") domain.bounceRate = Math.min(1, domain.bounceRate + 1 / total);
    if (reason === "complaint") domain.complaintRate = Math.min(1, domain.complaintRate + 1 / total);
  }
  return contact;
}

const EVENT_MAP: Record<string, EventType> = {
  delivered: "delivered",
  opened: "opened",
  clicked: "clicked",
  bounced: "bounced",
  rejected: "bounced",
  complained: "complained",
  unsubscribed: "unsubscribed",
  replied: "replied",
  stored: "replied",
  inbound: "replied",
};

export function extractEmail(raw: string): string {
  const trimmed = (raw || "").trim();
  const angle = trimmed.match(/<([^>]+)>/);
  return (angle ? angle[1] : trimmed).trim().toLowerCase();
}

export function classifyMailgunEvent(event: string, severity?: string): EventType | undefined {
  if (event === "failed") {
    if ((severity || "").toLowerCase() === "temporary") return undefined;
    return "bounced";
  }
  return EVENT_MAP[event];
}

function bounceNote(reason?: string, description?: string) {
  return [reason, description].map((part) => (part || "").trim()).filter(Boolean).join(" — ");
}

export function ingestMailgunEvent(input: {
  event: string;
  recipient: string;
  workspaceId: string;
  jobId?: string;
  campaignId?: string;
  sender?: string;
  severity?: string;
  reason?: string;
  description?: string;
}) {
  const type = classifyMailgunEvent(input.event, input.severity);
  if (!type) return;
  const inbound = type === "replied" && Boolean(input.sender);
  const email = extractEmail(inbound ? input.sender || input.recipient : input.recipient);
  if (!email) return;

  writeDb((db) => {
    const domain = db.domains.find((d) => d.workspaceId === input.workspaceId);
    if (
      inbound &&
      domain &&
      (email === domain.fromEmail.toLowerCase() || email.endsWith(`@${domain.domain.toLowerCase()}`))
    ) {
      return;
    }

    const contact = db.contacts.find(
      (c) => c.workspaceId === input.workspaceId && c.email.toLowerCase() === email,
    );
    let job = input.jobId ? db.jobs.find((j) => j.id === input.jobId) : undefined;
    if (!job) {
      job = db.jobs
        .filter(
          (j) =>
            j.workspaceId === input.workspaceId &&
            j.to.toLowerCase() === email &&
            (!input.campaignId || j.campaignId === input.campaignId),
        )
        .sort((a, b) => (b.sentAt || b.scheduledAt).localeCompare(a.sentAt || a.scheduledAt))[0];
    }

    let campaignId = input.campaignId || job?.campaignId;
    if (campaignId) {
      const inCampaign = db.jobs.some(
        (j) => j.campaignId === campaignId && j.to.toLowerCase() === email,
      );
      if (!inCampaign) campaignId = job?.campaignId;
      if (campaignId && !db.jobs.some((j) => j.campaignId === campaignId && j.to.toLowerCase() === email)) {
        campaignId = undefined;
      }
    }

    const uniqueKey = `${type}:${campaignId || ""}:${email}`;
    const already = db.events.some((e) => e.meta?.uniqueKey === uniqueKey);
    if (already) return;

    const note = bounceNote(input.reason, input.description);
    db.events.push({
      id: nid("evt"),
      workspaceId: input.workspaceId,
      contactId: contact?.id,
      jobId: job?.id,
      type,
      createdAt: new Date().toISOString(),
      meta: {
        email,
        uniqueKey,
        ...(campaignId ? { campaignId } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(note ? { bounceReason: note } : {}),
      },
    });

    const campaign = campaignId ? db.campaigns.find((c) => c.id === campaignId) : undefined;
    if (campaign) {
      if (type === "opened") campaign.stats.opened += 1;
      if (type === "clicked") campaign.stats.clicked += 1;
      if (type === "bounced") campaign.stats.bounced += 1;
      if (type === "complained") campaign.stats.complained += 1;
      if (type === "unsubscribed") campaign.stats.unsubscribed += 1;
      if (type === "replied") campaign.stats.replied = (campaign.stats.replied || 0) + 1;
    }

    if (type === "bounced" && job) {
      job.status = "failed";
      job.skipReason = note || "bounce permanente";
    }

    if (type === "bounced" || type === "complained" || type === "unsubscribed") {
      applySuppress(
        db,
        input.workspaceId,
        email,
        type === "complained" ? "complaint" : type === "bounced" ? "bounce" : "unsubscribe",
        false,
      );
    }
  });
}

export type CampaignReportRow = {
  email: string;
  name: string;
  sent: boolean;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  bounceReason: string;
  complained: boolean;
  unsubscribed: boolean;
  replied: boolean;
};

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export async function syncCampaignEvents(campaignId: string) {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return;
  const domain = db.domains.find((d) => d.workspaceId === campaign.workspaceId);
  if (!domain) return;
  const begin = new Date(Date.now() - 14 * 86400000);
  try {
    const events = await fetchDomainEvents(domain.domain, begin);
    const jobs = db.jobs.filter((j) => j.campaignId === campaign.id);
    for (const item of events) {
      const email = extractEmail(item.recipient);
      const senderEmail = extractEmail(item.sender || "");
      const belongs =
        item.campaignId === campaign.id ||
        Boolean(item.jobId && jobs.some((j) => j.id === item.jobId)) ||
        (!item.campaignId &&
          jobs.some((j) => j.to.toLowerCase() === email || (senderEmail && j.to.toLowerCase() === senderEmail)));
      if (!belongs) continue;
      ingestMailgunEvent({
        event: item.event,
        recipient: item.recipient,
        sender: item.sender,
        workspaceId: campaign.workspaceId,
        jobId: item.jobId,
        campaignId: campaign.id,
        severity: item.severity,
        reason: item.reason,
        description: item.description,
      });
    }
    const report = buildCampaignReport(campaign.id);
    if (report) {
      writeDb((d) => {
        const row = d.campaigns.find((c) => c.id === campaign.id);
        if (row) row.stats = report.stats;
      });
    }
  } catch {
    return;
  }
}

export function buildCampaignReport(campaignId: string) {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return null;
  const jobs = db.jobs.filter((j) => j.campaignId === campaignId);
  const events = db.events.filter(
    (e) => e.meta?.campaignId === campaignId || jobs.some((j) => j.id === e.jobId),
  );
  const rows: CampaignReportRow[] = jobs.map((job) => {
    const contact = db.contacts.find((c) => c.id === job.contactId);
    const related = events.filter(
      (e) =>
        e.jobId === job.id ||
        (e.meta?.campaignId === campaignId &&
          (e.contactId === job.contactId || e.meta?.email === job.to.toLowerCase())),
    );
    const bounce = related.find((e) => e.type === "bounced");
    return {
      email: job.to,
      name: contact?.name || "",
      sent: job.status === "sent" || job.status === "failed",
      delivered: related.some((e) => e.type === "delivered") && !bounce,
      opened: related.some((e) => e.type === "opened"),
      clicked: related.some((e) => e.type === "clicked"),
      bounced: Boolean(bounce),
      bounceReason: bounce?.meta?.bounceReason || job.skipReason || "",
      complained: related.some((e) => e.type === "complained"),
      unsubscribed: related.some((e) => e.type === "unsubscribed"),
      replied: related.some((e) => e.type === "replied"),
    };
  });
  const header = "email,name,sent,delivered,opened,clicked,bounced,bounce_reason,complained,unsubscribed,replied";
  const csv = [
    header,
    ...rows.map((r) =>
      [
        csvEscape(r.email),
        csvEscape(r.name),
        r.sent ? "1" : "0",
        r.delivered ? "1" : "0",
        r.opened ? "1" : "0",
        r.clicked ? "1" : "0",
        r.bounced ? "1" : "0",
        csvEscape(r.bounceReason),
        r.complained ? "1" : "0",
        r.unsubscribed ? "1" : "0",
        r.replied ? "1" : "0",
      ].join(","),
    ),
  ].join("\n");
  const stats = {
    queued: jobs.filter((j) => j.status === "queued").length,
    sent: rows.filter((r) => r.sent).length,
    delivered: rows.filter((r) => r.delivered).length,
    opened: rows.filter((r) => r.opened).length,
    clicked: rows.filter((r) => r.clicked).length,
    bounced: rows.filter((r) => r.bounced).length,
    complained: rows.filter((r) => r.complained).length,
    unsubscribed: rows.filter((r) => r.unsubscribed).length,
    replied: rows.filter((r) => r.replied).length,
  };
  return { campaign, stats, rows, csv };
}

export { emptyStats };
