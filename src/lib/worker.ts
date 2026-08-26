import { emptyStats, readDb, writeDb, workspaceDomain } from "./store";
import { sendMessage } from "./mailgun";
import { canRaiseWarmup, warmupCapForDay } from "./warmup";
import { nid, todayStamp } from "./ids";
import type { Campaign, Contact, SendingDomain, SendJob } from "./types";

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

    const contacts = db.contacts.filter(
      (c) => c.listId === campaign.listId && c.status === "active",
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
    if (used >= remainingCap(domain)) continue;

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
) {
  writeDb((db) => {
    const contact = db.contacts.find(
      (c) => c.workspaceId === workspaceId && c.email.toLowerCase() === email.toLowerCase(),
    );
    if (!contact) return;
    contact.status = "suppressed";
    contact.suppressReason = reason;
    db.events.push({
      id: nid("evt"),
      workspaceId,
      contactId: contact.id,
      type: reason === "bounce" ? "bounced" : reason === "complaint" ? "complained" : "unsubscribed",
      createdAt: new Date().toISOString(),
    });
    const domain = db.domains.find((d) => d.workspaceId === workspaceId);
    if (domain) {
      const total = Math.max(1, domain.sentToday + 20);
      if (reason === "bounce") domain.bounceRate = Math.min(1, domain.bounceRate + 1 / total);
      if (reason === "complaint") domain.complaintRate = Math.min(1, domain.complaintRate + 1 / total);
    }
  });
}

export { emptyStats };
