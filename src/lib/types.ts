export type UserRole = "admin" | "agency" | "workspace";
export type UserStatus = "active" | "disabled";
export type DomainStatus = "pending" | "verified" | "failed";
export type ContactSource = "csv" | "xlsx" | "crm" | "api";
export type ContactStatus = "active" | "suppressed";
export type SuppressReason = "bounce" | "complaint" | "unsubscribe";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "blocked";
export type SequenceStatus = "draft" | "active" | "paused";
export type EnrollmentStatus = "active" | "completed" | "stopped";
export type JobType = "campaign" | "sequence";
export type JobStatus = "queued" | "sent" | "failed" | "skipped";
export type EventType =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed";

export interface Agency {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  agencyId: string;
  workspaceId?: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  passwordHash: string;
}

export interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  workspaceId?: string;
  targetUserId?: string;
  meta?: Record<string, string>;
  createdAt: string;
}

export interface Workspace {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  purpose: "spf" | "dkim" | "dmarc" | "tracking" | "mx";
}

export interface SendingDomain {
  id: string;
  workspaceId: string;
  domain: string;
  fromName: string;
  fromEmail: string;
  status: DomainStatus;
  dnsRecords: DnsRecord[];
  dailyCap: number;
  sentToday: number;
  sentTodayDate: string;
  bounceRate: number;
  complaintRate: number;
  warmupDay: number;
  verifiedAt?: string;
}

export interface ContactList {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  workspaceId: string;
  listId: string;
  email: string;
  name: string;
  tags: string[];
  source: ContactSource;
  crmContactId?: string;
  status: ContactStatus;
  suppressReason?: SuppressReason;
  createdAt: string;
}

export interface Template {
  id: string;
  workspaceId: string;
  name: string;
  designJson: unknown;
  html: string;
  updatedAt: string;
}

export interface SendStats {
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  listId: string;
  templateId: string;
  name: string;
  subject: string;
  previewText: string;
  status: CampaignStatus;
  scheduledAt?: string;
  sentAt?: string;
  blockedReason?: string;
  stats: SendStats;
}

export interface SequenceStep {
  id: string;
  order: number;
  delayDays: number;
  templateId: string;
  subject: string;
}

export interface Sequence {
  id: string;
  workspaceId: string;
  name: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  createdAt: string;
}

export interface Enrollment {
  id: string;
  workspaceId: string;
  sequenceId: string;
  contactId: string;
  listId: string;
  currentStep: number;
  nextRunAt: string;
  status: EnrollmentStatus;
  startedAt: string;
}

export interface SendJob {
  id: string;
  workspaceId: string;
  type: JobType;
  campaignId?: string;
  enrollmentId?: string;
  stepId?: string;
  contactId: string;
  to: string;
  subject: string;
  html: string;
  status: JobStatus;
  skipReason?: string;
  scheduledAt: string;
  sentAt?: string;
  providerId?: string;
}

export interface MailEvent {
  id: string;
  workspaceId: string;
  contactId?: string;
  jobId?: string;
  type: EventType;
  createdAt: string;
  meta?: Record<string, string>;
}

export interface Database {
  agencies: Agency[];
  users: User[];
  workspaces: Workspace[];
  domains: SendingDomain[];
  lists: ContactList[];
  contacts: Contact[];
  templates: Template[];
  campaigns: Campaign[];
  sequences: Sequence[];
  enrollments: Enrollment[];
  jobs: SendJob[];
  events: MailEvent[];
  audit: AuditEvent[];
}

export interface SessionUser {
  id: string;
  agencyId: string;
  workspaceId?: string;
  email: string;
  name: string;
  role: UserRole;
  adminId?: string;
  impersonating?: boolean;
}
