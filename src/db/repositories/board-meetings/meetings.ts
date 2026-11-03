import 'server-only';
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  boardMeetingDocuments,
  boardMeetingEvents,
  boardMeetingReplies,
  boardMeetingVersions,
  boardMeetings,
  complianceTasks,
  engagements,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { listScopedEngagementIds } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import {
  KIND_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  isMeetingKind,
  isMeetingMode,
  isMeetingType,
  noticeEditable,
  type AgendaItem,
  type MeetingKind,
  type MeetingMode,
  type MeetingRecipient,
  type MeetingStatus,
  type MeetingType,
} from '@/lib/board-meetings/model';
import {
  breaksGap,
  isHhmm,
  isIsoDate,
  isShortNotice,
  momDueDate,
  nextMeetingLimit,
  noticeSendDate,
  prepareDate,
  shortDate,
  todayIst,
} from '@/lib/board-meetings/dates';
import { agendaPlaceholders, companyPrefix, fyLabel, meetingNumber, normaliseAgenda, quorumForecast, withCarriedResolutions } from '@/lib/board-meetings/rules';
import { buildNotice, type NoticeDoc } from '@/lib/board-meetings/notice';
import { directorsOfEngagement, systemSeedDirectors, toDirectorDto, type DirectorDto, type DirectorRow } from './directors';
import { systemLibraryMap } from './library';
import {
  BoardMeetingError,
  canApprove,
  companyInfoOf,
  conflict,
  firmAdmins,
  forbidden,
  invalid,
  isStaff,
  leadProfileId,
  managerProfileId,
  notFound,
  clientMaySee,
  notifyMeeting,
  peopleById,
  recordMeetingEvent,
  scopedEngagement,
  scopedMeeting,
  scopedMeetingForWrite,
  type CompanyInfo,
  type MeetingRow,
} from './shared';

/**
 * BOARD MEETINGS — create, edit the notice, submit, approve (the route then sends), send back,
 * reschedule, cancel, director replies, and the meeting view every screen reads. Access rules:
 * `shared.ts`. The linked compliance task keeps the meeting in Obligations, Today and the
 * calendar; its stage follows the meeting (`syncTask`).
 */

export type { MeetingRow };

export interface MeetingListRow {
  id: string;
  engagementId: string;
  companyName: string;
  kind: MeetingKind;
  meetingType: MeetingType;
  meetingNo: string;
  meetingDate: string;
  meetingTime: string;
  status: MeetingStatus;
  statusLabel: string;
  /** Stage line: "Notice: draft, due 2 Sep", "MoM: not uploaded". */
  stage: string;
  word: 'Not started' | 'In progress' | 'Waiting' | 'Due soon' | 'Overdue' | 'Done';
  noticeDue: string;
  momDue: string;
  momState: 'none' | 'draft' | 'sent' | 'locked';
  quorum: { state: 'ok' | 'at_risk' | 'lost'; attending: number; needed: number } | null;
  resolutions: { locked: number; open: number };
  nextBy: string | null;
  leadName: string | null;
  postInc: boolean;
}

export interface ReplyDto {
  directorId: string;
  name: string;
  din: string | null;
  reply: 'yes' | 'no' | null;
  note: string | null;
  repliedAt: string | null;
}

export interface MeetingDocumentDto {
  id: string;
  kind: 'mom' | 'resolution';
  title: string;
  description: string;
  resolutionDate: string | null;
  changesItem: string | null;
  reason: string | null;
  signerIds: string[];
  signers: Array<{ id: string; name: string; din: string | null; state: 'not_sent' | 'sent' | 'opened' | 'reminded' | 'signed'; log: Array<{ event: string; at: string }> }>;
  status: 'draft' | 'sent' | 'locked';
  fileName: string | null;
  signedName: string | null;
  hasFile: boolean;
  hasSigned: boolean;
  sentAt: string | null;
  lockedAt: string | null;
  finalSentAt: string | null;
  createdAt: string;
}

export interface MeetingDto {
  id: string;
  engagementId: string;
  company: CompanyInfo;
  kind: MeetingKind;
  kindLabel: string;
  meetingType: MeetingType;
  typeLabel: string;
  meetingNo: string;
  meetingDate: string;
  meetingTime: string;
  secondZone: { label: string; time: string } | null;
  mode: MeetingMode;
  venue: string;
  status: MeetingStatus;
  statusLabel: string;
  version: number;
  agenda: AgendaItem[];
  bodyOverride: string[] | null;
  recipients: MeetingRecipient[];
  signatoryDirectorId: string | null;
  teamsLink: string | null;
  icsSequence: number;
  postInc: boolean;
  noticeOn: string | null;
  shortNotice: boolean;
  reviewNote: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  rescheduledFrom: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lockedAt: string | null;
  dates: {
    today: string;
    prepare: string;
    noticeSend: string;
    momDue: string;
    lastMeetingDate: string | null;
    lastMeetingNo: string | null;
    gapLimit: string | null;
    breaksGap: boolean;
    shortNoticeIfSentToday: boolean;
  };
  notice: NoticeDoc;
  placeholders: string[];
  directors: DirectorDto[];
  replies: ReplyDto[];
  quorum: { state: 'ok' | 'at_risk' | 'lost'; attending: number; needed: number; open: number };
  documents: MeetingDocumentDto[];
  carried: string[];
  events: Array<{ at: string; who: string | null; label: string }>;
  versions: Array<{ version: number; at: string; who: string | null }>;
  lead: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  can: {
    editNotice: boolean;
    submit: boolean;
    approve: boolean;
    reschedule: boolean;
    cancel: boolean;
    uploadMom: boolean;
    addResolution: boolean;
    remind: boolean;
  };
}

const TASK_STAGE: Record<MeetingStatus, string> = {
  draft: 'in-progress',
  pending_approval: 'review',
  approved: 'waiting',
  sent: 'waiting',
  held: 'in-progress',
  cancelled: 'not-applicable',
};

/** Keep the linked compliance task in line with the meeting (stage, dates, name). */
export async function syncTask(meeting: MeetingRow, momLocked = false): Promise<void> {
  if (!meeting.taskId) return;
  try {
    const status = meeting.status as MeetingStatus;
    const held = status === 'held';
    await db
      .update(complianceTasks)
      .set({
        name: `${KIND_LABEL[meeting.kind as MeetingKind] ?? 'Board meeting'} · ${shortDate(meeting.meetingDate)}`,
        dueDate: held ? momDueDate(meeting.meetingDate) : meeting.meetingDate,
        stage: momLocked ? 'completed' : TASK_STAGE[status] ?? 'in-progress',
        completedAt: momLocked ? new Date() : null,
        visibility: meeting.sentAt ? 'both' : 'firm',
        updatedAt: new Date(),
      })
      .where(eq(complianceTasks.id, meeting.taskId));
  } catch (err) {
    console.error('[board-meetings] task sync failed', err);
  }
}

/** A sent meeting whose date has passed is held (lazy, also run by the daily job). */
async function markHeldIfPast(meeting: MeetingRow, today: string): Promise<MeetingRow> {
  if (meeting.status !== 'sent' || meeting.meetingDate >= today) return meeting;
  const [next] = await db.update(boardMeetings).set({ status: 'held', updatedAt: new Date() }).where(and(eq(boardMeetings.id, meeting.id), eq(boardMeetings.status, 'sent'))).returning();
  if (!next) return meeting;
  await syncTask(next);
  return next;
}

async function previousMeeting(meeting: Pick<MeetingRow, 'id' | 'engagementId' | 'kind' | 'meetingDate'>): Promise<MeetingRow | null> {
  const [row] = await db
    .select()
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.engagementId, meeting.engagementId),
        eq(boardMeetings.kind, meeting.kind),
        ne(boardMeetings.id, meeting.id),
        ne(boardMeetings.status, 'cancelled'),
        lt(boardMeetings.meetingDate, meeting.meetingDate),
      ),
    )
    .orderBy(desc(boardMeetings.meetingDate))
    .limit(1);
  return row ?? null;
}

/** Lines for the circulation item: locked resolutions of the previous meeting. */
async function carriedLines(prev: MeetingRow | null): Promise<string[]> {
  if (!prev) return [];
  const docs = await db
    .select()
    .from(boardMeetingDocuments)
    .where(and(eq(boardMeetingDocuments.meetingId, prev.id), eq(boardMeetingDocuments.kind, 'resolution'), eq(boardMeetingDocuments.status, 'locked')))
    .orderBy(asc(boardMeetingDocuments.resolutionDate), asc(boardMeetingDocuments.createdAt));
  return docs.map((d) => `Resolution of ${d.resolutionDate ? shortDate(d.resolutionDate).slice(4) : shortDate(d.createdAt.toISOString().slice(0, 10)).slice(4)}: ${d.title}${d.changesItem ? ` (changes ${d.changesItem} of the ${shortDate(prev.meetingDate).slice(4)} meeting)` : ''}`);
}

function signatoryOf(meeting: MeetingRow, directors: DirectorRow[]): { name: string; din: string | null; designation: string } | null {
  const d = directors.find((x) => x.id === meeting.signatoryDirectorId);
  return d ? { name: d.name, din: d.din, designation: d.designation } : null;
}

export function noticeFor(meeting: MeetingRow, company: CompanyInfo, directors: DirectorRow[], agenda: AgendaItem[], noticeOn: string): NoticeDoc {
  const to = meeting.recipients.filter((r) => r.kind === 'to' && r.directorId).map((r) => ({ name: r.name }));
  return buildNotice({
    companyName: company.name,
    cin: company.cin,
    address: company.address,
    kind: meeting.kind as MeetingKind,
    meetingNo: meeting.meetingNo,
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    secondZone: meeting.secondZoneLabel && meeting.secondZoneTime ? { label: meeting.secondZoneLabel, time: meeting.secondZoneTime } : null,
    mode: meeting.mode as MeetingMode,
    venue: meeting.venue,
    noticeOn,
    to,
    signatory: signatoryOf(meeting, directors),
    agenda,
    teamsLink: meeting.teamsLink,
    bodyOverride: meeting.bodyOverride,
  });
}

/** The agenda as it will go out: fixed items in place and last meeting's resolutions carried. */
export async function finalAgenda(meeting: MeetingRow, prev?: MeetingRow | null): Promise<{ agenda: AgendaItem[]; carried: string[] }> {
  const library = await systemLibraryMap();
  const before = prev === undefined ? await previousMeeting(meeting) : prev;
  const carried = await carriedLines(before);
  const agenda = withCarriedResolutions(normaliseAgenda(meeting.agenda, meeting.meetingType as MeetingType, library), carried);
  return { agenda, carried };
}

async function documentsOf(meeting: MeetingRow, directors: DirectorRow[], clientView: boolean): Promise<MeetingDocumentDto[]> {
  const { listMeetingDocuments } = await import('./documents');
  return listMeetingDocuments(meeting, directors, clientView);
}

function permissions(ctx: AuthContext, meeting: MeetingRow, today: string): MeetingDto['can'] {
  const s = meeting.status as MeetingStatus;
  const staff = isStaff(ctx.role);
  const after = meeting.meetingDate <= today;
  return {
    editNotice: staff && (s === 'draft' || (s === 'pending_approval' && canApprove(ctx.role))),
    submit: staff && s === 'draft',
    approve: canApprove(ctx.role) && s === 'pending_approval',
    reschedule: staff && (s === 'approved' || s === 'sent'),
    cancel: staff && s !== 'cancelled' && s !== 'held',
    uploadMom: staff && after && s !== 'cancelled' && s !== 'draft' && s !== 'pending_approval',
    addResolution: staff && after && (s === 'sent' || s === 'held') && !meeting.lockedAt,
    remind: staff && s === 'sent',
  };
}

async function buildDto(ctx: AuthContext, meetingIn: MeetingRow, engagement: EngagementDbRow): Promise<MeetingDto> {
  const today = todayIst();
  const meeting = await markHeldIfPast(meetingIn, today);
  await systemSeedDirectors(engagement);
  const directors = await directorsOfEngagement(engagement.id);
  const company = companyInfoOf(engagement);
  const prev = await previousMeeting(meeting);
  const { agenda, carried } = await finalAgenda(meeting, prev);
  const replyRows = await db.select().from(boardMeetingReplies).where(eq(boardMeetingReplies.meetingId, meeting.id));
  const invited = meeting.recipients.filter((r) => r.kind === 'to' && r.directorId);
  const replies: ReplyDto[] = invited.map((r) => {
    const d = directors.find((x) => x.id === r.directorId);
    const rep = replyRows.find((x) => x.directorId === r.directorId);
    return {
      directorId: r.directorId!,
      name: d?.name ?? r.name,
      din: d?.din ?? null,
      reply: rep ? (rep.reply as 'yes' | 'no') : null,
      note: rep?.note ?? null,
      repliedAt: rep?.repliedAt.toISOString() ?? null,
    };
  });
  const quorum = quorumForecast(replies.map((r) => r.reply));
  const clientView = ctx.role === 'client';
  const eventRows = clientView ? [] : await db.select().from(boardMeetingEvents).where(eq(boardMeetingEvents.meetingId, meeting.id)).orderBy(desc(boardMeetingEvents.createdAt)).limit(60);
  const versionRows = clientView ? [] : await db.select().from(boardMeetingVersions).where(eq(boardMeetingVersions.meetingId, meeting.id)).orderBy(asc(boardMeetingVersions.version));
  const leadId = await leadProfileId(engagement);
  const managerId = managerProfileId(engagement);
  const people = await peopleById([...eventRows.map((e) => e.actorId), ...versionRows.map((v) => v.actorId), leadId, managerId, meeting.submittedBy, meeting.approvedBy]);
  const name = (id: string | null | undefined) => (id ? people.get(id)?.name ?? null : null);
  const noticeOn = meeting.noticeOn ?? (meeting.status === 'draft' || meeting.status === 'pending_approval' ? (today > noticeSendDate(meeting.meetingDate) ? today : noticeSendDate(meeting.meetingDate)) : today);
  const notice = noticeFor(meeting, company, directors, agenda, noticeOn);
  const lastDate = prev?.meetingDate ?? null;
  const documents = await documentsOf(meeting, directors, clientView);
  return {
    id: meeting.id,
    engagementId: appEngagementId(engagement.id),
    company,
    kind: meeting.kind as MeetingKind,
    kindLabel: KIND_LABEL[meeting.kind as MeetingKind] ?? 'Board meeting',
    meetingType: meeting.meetingType as MeetingType,
    typeLabel: TYPE_LABEL[meeting.meetingType as MeetingType] ?? 'Board meeting',
    meetingNo: meeting.meetingNo,
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    secondZone: meeting.secondZoneLabel && meeting.secondZoneTime ? { label: meeting.secondZoneLabel, time: meeting.secondZoneTime } : null,
    mode: meeting.mode as MeetingMode,
    venue: meeting.venue,
    status: meeting.status as MeetingStatus,
    statusLabel: STATUS_LABEL[meeting.status as MeetingStatus] ?? meeting.status,
    version: meeting.version,
    agenda,
    bodyOverride: meeting.bodyOverride,
    recipients: clientView ? meeting.recipients.filter((r) => r.kind === 'to').map((r) => ({ ...r, email: null })) : meeting.recipients,
    signatoryDirectorId: meeting.signatoryDirectorId,
    teamsLink: meeting.teamsLink,
    icsSequence: meeting.icsSequence,
    postInc: meeting.postInc,
    noticeOn: meeting.noticeOn,
    shortNotice: meeting.shortNotice,
    reviewNote: clientView ? null : meeting.reviewNote,
    submittedAt: meeting.submittedAt?.toISOString() ?? null,
    submittedBy: name(meeting.submittedBy),
    approvedAt: meeting.approvedAt?.toISOString() ?? null,
    approvedBy: name(meeting.approvedBy),
    sentAt: meeting.sentAt?.toISOString() ?? null,
    rescheduledFrom: meeting.rescheduledFrom,
    cancelledAt: meeting.cancelledAt?.toISOString() ?? null,
    cancelReason: meeting.cancelReason,
    lockedAt: meeting.lockedAt?.toISOString() ?? null,
    dates: {
      today,
      prepare: prepareDate(meeting.meetingDate),
      noticeSend: noticeSendDate(meeting.meetingDate),
      momDue: momDueDate(meeting.meetingDate),
      lastMeetingDate: lastDate,
      lastMeetingNo: prev?.meetingNo ?? null,
      gapLimit: lastDate ? nextMeetingLimit(lastDate) : null,
      breaksGap: meeting.kind === 'board' && breaksGap(lastDate, meeting.meetingDate),
      shortNoticeIfSentToday: isShortNotice(today, meeting.meetingDate),
    },
    notice,
    placeholders: agendaPlaceholders(agenda),
    directors: directors.map((d) => toDirectorDto(d, meeting.meetingDate)).map((d) => (clientView ? { ...d, email: null, phone: null } : d)),
    replies,
    quorum,
    documents,
    carried,
    events: eventRows.map((e) => ({ at: e.createdAt.toISOString(), who: name(e.actorId), label: e.label })),
    versions: versionRows.map((v) => ({ version: v.version, at: v.createdAt.toISOString(), who: name(v.actorId) })),
    lead: leadId ? { id: leadId, name: name(leadId) ?? 'Lead' } : null,
    manager: managerId ? { id: managerId, name: name(managerId) ?? 'Manager' } : null,
    can: permissions(ctx, meeting, today),
  };
}

export async function getMeeting(ctx: AuthContext, meetingId: string): Promise<MeetingDto> {
  const { meeting, engagement } = await scopedMeeting(ctx, meetingId);
  return buildDto(ctx, meeting, engagement);
}

/** Rows for Obligations, the admin overview and the client list. */
export async function listMeetings(ctx: AuthContext, opts: { engagementId?: string | null } = {}): Promise<MeetingListRow[]> {
  if (!isStaff(ctx.role) && ctx.role !== 'client') return [];
  let ids: string[];
  if (opts.engagementId) ids = [(await scopedEngagement(ctx, opts.engagementId, true)).id];
  else if (isFirmWideAdmin(ctx.role)) ids = [];
  else {
    ids = await listScopedEngagementIds(ctx);
    if (ids.length === 0) return [];
  }
  const base = db
    .select({ m: boardMeetings, companyName: engagements.companyName, internId: engagements.internId })
    .from(boardMeetings)
    .innerJoin(engagements, eq(engagements.id, boardMeetings.engagementId));
  const where = ids.length ? and(inArray(boardMeetings.engagementId, ids), isNull(engagements.deletedAt)) : isNull(engagements.deletedAt);
  const rows = await base.where(where).orderBy(desc(boardMeetings.meetingDate)).limit(500);
  const today = todayIst();
  const visible = ctx.role === 'client' ? rows.filter((r) => clientMaySee(r.m)) : rows;
  if (visible.length === 0) return [];
  const meetingIds = visible.map((r) => r.m.id);
  const docs = await db
    .select({ meetingId: boardMeetingDocuments.meetingId, kind: boardMeetingDocuments.kind, status: boardMeetingDocuments.status })
    .from(boardMeetingDocuments)
    .where(inArray(boardMeetingDocuments.meetingId, meetingIds));
  const replies = await db.select({ meetingId: boardMeetingReplies.meetingId, directorId: boardMeetingReplies.directorId, reply: boardMeetingReplies.reply }).from(boardMeetingReplies).where(inArray(boardMeetingReplies.meetingId, meetingIds));
  // The latest held or sent board meeting per engagement sets "next by".
  const lastByEng = new Map<string, string>();
  for (const r of rows) {
    if (r.m.kind !== 'board' || r.m.status === 'cancelled' || r.m.meetingDate > today) continue;
    const have = lastByEng.get(r.m.engagementId);
    if (!have || have < r.m.meetingDate) lastByEng.set(r.m.engagementId, r.m.meetingDate);
  }
  return visible.map(({ m: raw, companyName }) => {
    const m = raw.status === 'sent' && raw.meetingDate < today ? { ...raw, status: 'held' } : raw;
    const status = m.status as MeetingStatus;
    const myDocs = docs.filter((d) => d.meetingId === m.id);
    const mom = myDocs.find((d) => d.kind === 'mom');
    const momState = (mom?.status ?? 'none') as MeetingListRow['momState'];
    const res = myDocs.filter((d) => d.kind === 'resolution');
    const invited = m.recipients.filter((r) => r.kind === 'to' && r.directorId);
    const rep = invited.map((r) => (replies.find((x) => x.meetingId === m.id && x.directorId === r.directorId)?.reply as 'yes' | 'no' | undefined) ?? null);
    const quorum = status === 'sent' || status === 'approved' ? quorumForecast(rep) : null;
    const noticeDue = noticeSendDate(m.meetingDate);
    const momDue = momDueDate(m.meetingDate);
    let stage = STATUS_LABEL[status];
    let word: MeetingListRow['word'] = 'In progress';
    if (status === 'draft') {
      stage = `Notice: draft, due ${shortDate(noticeDue).slice(4, -5)}`;
      word = today > noticeDue ? 'Overdue' : today >= prepareDate(m.meetingDate) ? 'Due soon' : 'In progress';
    } else if (status === 'pending_approval') {
      stage = 'Notice: waiting for the manager';
      word = today > noticeDue ? 'Overdue' : 'Waiting';
    } else if (status === 'approved' || status === 'sent') {
      stage = quorum && quorum.state !== 'ok' ? `Quorum at risk · ${quorum.attending} of ${quorum.needed}` : 'Notice sent';
      word = 'Waiting';
    } else if (status === 'held') {
      if (momState === 'locked') {
        stage = res.some((d) => d.status !== 'locked') ? 'MoM signed · resolution waiting' : 'MoM signed';
        word = 'Done';
      } else {
        stage = momState === 'none' ? 'MoM: not uploaded' : momState === 'draft' ? 'MoM: uploaded, not sent' : 'MoM: with the directors';
        word = today > momDue ? 'Overdue' : 'In progress';
      }
    } else if (status === 'cancelled') {
      stage = 'Cancelled';
      word = 'Not started';
    }
    const last = lastByEng.get(m.engagementId) ?? null;
    return {
      id: m.id,
      engagementId: appEngagementId(m.engagementId),
      companyName,
      kind: m.kind as MeetingKind,
      meetingType: m.meetingType as MeetingType,
      meetingNo: m.meetingNo,
      meetingDate: m.meetingDate,
      meetingTime: m.meetingTime,
      status,
      statusLabel: STATUS_LABEL[status],
      stage,
      word,
      noticeDue,
      momDue,
      momState,
      quorum,
      resolutions: { locked: res.filter((d) => d.status === 'locked').length, open: res.filter((d) => d.status !== 'locked').length },
      nextBy: last ? nextMeetingLimit(last) : null,
      leadName: null,
      postInc: m.postInc,
    };
  });
}

export interface CreateMeetingInput {
  engagementId: string;
  kind?: string;
  meetingType?: string;
  meetingDate: string;
  meetingTime: string;
  secondZone?: { label: string; time: string } | null;
  mode?: string;
  venue?: string | null;
  postInc?: boolean;
  /** Copy directors, time, mode, venue, CC and agenda from the last meeting (default true). */
  copyFromLast?: boolean;
}

function cleanZone(z: { label: string; time: string } | null | undefined): { label: string; time: string } | null {
  if (!z || !z.label?.trim() || !isHhmm(z.time)) return null;
  return { label: z.label.trim().slice(0, 12).toUpperCase(), time: z.time };
}

async function defaultRecipients(engagement: EngagementDbRow, directors: DirectorRow[], onDate: string): Promise<MeetingRecipient[]> {
  const current = directors.filter((d) => !d.ceasedOn || d.ceasedOn > onDate);
  const to: MeetingRecipient[] = current.map((d) => ({ kind: 'to', directorId: d.id, name: d.name, email: d.email, role: d.designation }));
  const leadId = await leadProfileId(engagement);
  const managerId = managerProfileId(engagement);
  const people = await peopleById([leadId, managerId, engagement.adminId]);
  const cc: MeetingRecipient[] = [];
  const add = (id: string | null | undefined, role: string) => {
    const p = id ? people.get(id) : null;
    if (p && !cc.some((c) => c.email === p.email)) cc.push({ kind: 'cc', directorId: null, name: p.name, email: p.email, role });
  };
  add(engagement.adminId, 'Admin');
  add(managerId, 'Manager');
  add(leadId, 'Lead');
  if (!engagement.adminId) {
    const admins = await firmAdmins();
    const first = admins.find((a) => a.role === 'admin') ?? admins[0];
    if (first && !cc.some((c) => c.email === first.email)) cc.unshift({ kind: 'cc', directorId: null, name: first.name, email: first.email, role: 'Admin' });
  }
  return [...to, ...cc];
}

export async function createMeeting(ctx: AuthContext, input: CreateMeetingInput): Promise<MeetingDto> {
  if (!isStaff(ctx.role)) throw forbidden();
  const engagement = await scopedEngagement(ctx, input.engagementId);
  if (!isIsoDate(input.meetingDate)) throw invalid('bad_date');
  if (!isHhmm(input.meetingTime)) throw invalid('bad_time');
  const kind: MeetingKind = isMeetingKind(input.kind) ? input.kind : 'board';
  const meetingType: MeetingType = isMeetingType(input.meetingType) ? input.meetingType : input.postInc ? 'first' : 'quarterly';
  const mode: MeetingMode = isMeetingMode(input.mode) ? input.mode : 'vc';

  await systemSeedDirectors(engagement);
  const directors = await directorsOfEngagement(engagement.id);
  const company = companyInfoOf(engagement);
  const fy = fyLabel(input.meetingDate);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardMeetings)
    .where(and(eq(boardMeetings.engagementId, engagement.id), eq(boardMeetings.kind, kind), sql`${boardMeetings.meetingNo} like ${`%/${fy}`}`));
  const seq = Number(n) + 1;
  const meetingNo = meetingNumber(companyPrefix(company.name), seq, fy, kind);

  const [last] = await db
    .select()
    .from(boardMeetings)
    .where(and(eq(boardMeetings.engagementId, engagement.id), eq(boardMeetings.kind, kind), ne(boardMeetings.status, 'cancelled')))
    .orderBy(desc(boardMeetings.meetingDate))
    .limit(1);
  const copy = input.copyFromLast !== false && last ? last : null;

  let recipients = await defaultRecipients(engagement, directors, input.meetingDate);
  if (copy) {
    // Keep the extra people from the last notice (CS, invitees) that are not directors.
    const extras = copy.recipients.filter((r) => !r.directorId && !recipients.some((x) => x.email && x.email === r.email));
    recipients = [...recipients, ...extras];
  }
  const library = await systemLibraryMap();
  const usedBefore = copy ? copy.agenda.filter((a) => !a.fixed).map((a) => ({ ...a, key: `c-${a.key}`, subs: [] })) : [];
  const agenda = normaliseAgenda(usedBefore, meetingType, library);
  const current = directors.filter((d) => !d.ceasedOn || d.ceasedOn > input.meetingDate);
  const signatory = copy?.signatoryDirectorId && current.some((d) => d.id === copy.signatoryDirectorId) ? copy.signatoryDirectorId : (current.find((d) => d.din)?.id ?? current[0]?.id ?? null);
  const zone = input.secondZone !== undefined ? cleanZone(input.secondZone) : copy?.secondZoneLabel && copy.secondZoneTime ? { label: copy.secondZoneLabel, time: copy.secondZoneTime } : null;

  const [row] = await db
    .insert(boardMeetings)
    .values({
      engagementId: engagement.id,
      kind,
      meetingType,
      seq,
      meetingNo,
      meetingDate: input.meetingDate,
      meetingTime: input.meetingTime,
      secondZoneLabel: zone?.label ?? null,
      secondZoneTime: zone?.time ?? null,
      mode,
      venue: (input.venue?.trim() || copy?.venue || company.address || '').slice(0, 500),
      agenda,
      recipients,
      signatoryDirectorId: signatory,
      postInc: Boolean(input.postInc),
      createdBy: ctx.userId,
    })
    .returning();
  if (!row) throw invalid('create_failed');

  // The linked task: Obligations › Non-statutory, Today and the calendar show the meeting.
  const leadId = await leadProfileId(engagement);
  const managerId = managerProfileId(engagement);
  const startDate = prepareDate(input.meetingDate) < todayIst() ? todayIst() : prepareDate(input.meetingDate);
  const [task] = await db
    .insert(complianceTasks)
    .values({
      engagementId: engagement.id,
      activityId: null,
      name: `${KIND_LABEL[kind]} · ${shortDate(input.meetingDate)}`,
      periodLabel: meetingNo,
      startDate: startDate > input.meetingDate ? input.meetingDate : startDate,
      dueDate: input.meetingDate,
      urgency: 'High',
      // The client sees the meeting once the notice is sent (`syncTask` opens it then).
      visibility: 'firm',
      ownerId: leadId,
      reviewerId: managerId,
      stage: 'in-progress',
      repeats: 'one-time',
      remindBefore: 10,
      boardMeetingId: row.id,
      createdBy: ctx.userId,
    })
    .returning({ id: complianceTasks.id });
  const [withTask] = await db.update(boardMeetings).set({ taskId: task?.id ?? null }).where(eq(boardMeetings.id, row.id)).returning();
  await recordMeetingEvent(ctx.userId, row.id, copy ? `Created the meeting · copied from ${copy.meetingNo}` : 'Created the meeting');
  await recordAuditEvent(ctx, { engagementId: engagement.id, action: 'board_meeting.created', summary: `Created ${meetingNo} on ${input.meetingDate}`, metadata: { meetingId: row.id } });
  if (leadId && leadId !== ctx.userId) {
    await notifyMeeting(
      { userId: ctx.userId, name: ctx.name },
      { meeting: withTask ?? row, companyName: company.name, title: `Prepare the notice: ${meetingNo}`, body: `Board meeting on ${shortDate(input.meetingDate)}. Send the notice for approval by ${shortDate(noticeSendDate(input.meetingDate))}.`, recipientIds: [leadId] },
    );
  }
  return buildDto(ctx, withTask ?? row, engagement);
}

export interface UpdateMeetingInput {
  meetingDate?: string;
  meetingTime?: string;
  secondZone?: { label: string; time: string } | null;
  mode?: string;
  venue?: string;
  meetingType?: string;
  agenda?: AgendaItem[];
  bodyOverride?: string[] | null;
  recipients?: MeetingRecipient[];
  signatoryDirectorId?: string | null;
  teamsLink?: string | null;
}

function cleanAgenda(items: AgendaItem[]): AgendaItem[] {
  return items.slice(0, 80).map((a, i) => ({
    key: String(a.key || `k${i}`).slice(0, 40),
    libraryId: a.libraryId ? String(a.libraryId).slice(0, 20) : null,
    text: String(a.text ?? '').trim().slice(0, 2000),
    subs: (Array.isArray(a.subs) ? a.subs : []).map((s) => String(s).trim().slice(0, 1000)).filter(Boolean).slice(0, 20),
    ...(a.fixed ? { fixed: a.fixed } : {}),
  })).filter((a) => a.text);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanRecipients(list: MeetingRecipient[], directors: DirectorRow[]): MeetingRecipient[] {
  const out: MeetingRecipient[] = [];
  for (const r of list.slice(0, 60)) {
    const kind = r.kind === 'cc' ? 'cc' : 'to';
    if (r.directorId) {
      const d = directors.find((x) => x.id === r.directorId);
      if (!d) continue;
      out.push({ kind, directorId: d.id, name: d.name, email: d.email, role: d.designation });
      continue;
    }
    const name = String(r.name ?? '').trim().slice(0, 120);
    const email = String(r.email ?? '').trim().slice(0, 200) || null;
    if (!name && !email) continue;
    if (email && !EMAIL.test(email)) throw invalid('bad_email');
    out.push({ kind, directorId: null, name: name || email!, email, role: r.role ? String(r.role).slice(0, 60) : null });
  }
  return out;
}

export async function updateMeeting(ctx: AuthContext, meetingId: string, input: UpdateMeetingInput): Promise<MeetingDto> {
  const { meeting, engagement } = await scopedMeetingForWrite(ctx, meetingId);
  const status = meeting.status as MeetingStatus;
  if (!noticeEditable(status)) throw conflict('notice_locked');
  if (status === 'pending_approval' && !canApprove(ctx.role)) throw forbidden();
  const directors = await directorsOfEngagement(engagement.id);
  const patch: Partial<typeof boardMeetings.$inferInsert> = {};
  const changed: string[] = [];
  if (input.meetingDate !== undefined) {
    if (!isIsoDate(input.meetingDate)) throw invalid('bad_date');
    if (input.meetingDate !== meeting.meetingDate) {
      patch.meetingDate = input.meetingDate;
      changed.push('date');
    }
  }
  if (input.meetingTime !== undefined) {
    if (!isHhmm(input.meetingTime)) throw invalid('bad_time');
    if (input.meetingTime !== meeting.meetingTime) {
      patch.meetingTime = input.meetingTime;
      changed.push('time');
    }
  }
  if (input.secondZone !== undefined) {
    const z = cleanZone(input.secondZone);
    patch.secondZoneLabel = z?.label ?? null;
    patch.secondZoneTime = z?.time ?? null;
  }
  if (input.mode !== undefined) {
    if (!isMeetingMode(input.mode)) throw invalid('bad_mode');
    patch.mode = input.mode;
  }
  if (input.meetingType !== undefined) {
    if (!isMeetingType(input.meetingType)) throw invalid('bad_type');
    patch.meetingType = input.meetingType;
  }
  if (input.venue !== undefined) patch.venue = input.venue.trim().slice(0, 500);
  if (input.agenda !== undefined) {
    patch.agenda = cleanAgenda(input.agenda);
    changed.push('agenda');
  }
  if (input.bodyOverride !== undefined) {
    const body = input.bodyOverride ? input.bodyOverride.map((p) => String(p).trim().slice(0, 4000)).filter(Boolean).slice(0, 20) : null;
    patch.bodyOverride = body && body.length ? body : null;
    changed.push('text');
  }
  if (input.recipients !== undefined) {
    patch.recipients = cleanRecipients(input.recipients, directors);
    changed.push('recipients');
  }
  if (input.signatoryDirectorId !== undefined) {
    if (input.signatoryDirectorId && !directors.some((d) => d.id === input.signatoryDirectorId)) throw invalid('bad_signatory');
    patch.signatoryDirectorId = input.signatoryDirectorId;
  }
  if (input.teamsLink !== undefined) {
    const link = input.teamsLink?.trim() || null;
    if (link && !/^https:\/\//.test(link)) throw invalid('bad_link');
    patch.teamsLink = link;
  }
  if (Object.keys(patch).length === 0) return buildDto(ctx, meeting, engagement);

  // An edit while waiting for approval (the manager's) makes a new version.
  const versioned = status === 'pending_approval';
  if (versioned) patch.version = meeting.version + 1;
  const [next] = await db.update(boardMeetings).set({ ...patch, updatedAt: new Date() }).where(eq(boardMeetings.id, meeting.id)).returning();
  if (!next) throw notFound();
  if (versioned) {
    await db
      .insert(boardMeetingVersions)
      .values({ meetingId: next.id, version: next.version, actorId: ctx.userId, snapshot: { meetingDate: next.meetingDate, meetingTime: next.meetingTime, agenda: next.agenda, bodyOverride: next.bodyOverride, recipients: next.recipients } })
      .onConflictDoNothing();
    await recordMeetingEvent(ctx.userId, next.id, `Edited the notice (${changed.join(', ') || 'details'}) · version ${next.version}`);
  }
  if (patch.meetingDate) await syncTask(next);
  return buildDto(ctx, next, engagement);
}

/** Lead → manager. Blocks on unfilled fields, no director to send to, or no venue. */
export async function submitMeeting(ctx: AuthContext, meetingId: string): Promise<MeetingDto> {
  const { meeting, engagement } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.status !== 'draft') throw conflict('not_draft');
  const { agenda } = await finalAgenda(meeting);
  if (agendaPlaceholders(agenda).length) throw invalid('blank_fields');
  if (!meeting.recipients.some((r) => r.kind === 'to' && r.directorId && r.email)) throw invalid('no_director_email');
  if (!meeting.venue.trim()) throw invalid('venue_required');
  const [next] = await db
    .update(boardMeetings)
    .set({ status: 'pending_approval', submittedAt: new Date(), submittedBy: ctx.userId, reviewNote: null, updatedAt: new Date() })
    .where(and(eq(boardMeetings.id, meeting.id), eq(boardMeetings.status, 'draft')))
    .returning();
  if (!next) throw conflict('not_draft');
  await db
    .insert(boardMeetingVersions)
    .values({ meetingId: next.id, version: next.version, actorId: ctx.userId, snapshot: { meetingDate: next.meetingDate, meetingTime: next.meetingTime, agenda: next.agenda, bodyOverride: next.bodyOverride, recipients: next.recipients } })
    .onConflictDoNothing();
  await recordMeetingEvent(ctx.userId, next.id, 'Sent the notice for approval');
  await syncTask(next);
  const company = companyInfoOf(engagement);
  await notifyMeeting(
    { userId: ctx.userId, name: ctx.name },
    { meeting: next, companyName: company.name, title: `Approve the notice: ${next.meetingNo}`, body: `${ctx.name} sent the board meeting notice for ${shortDate(next.meetingDate)}. Approve by ${shortDate(noticeSendDate(next.meetingDate))}.`, recipientIds: [managerProfileId(engagement)] },
  );
  return buildDto(ctx, next, engagement);
}

/** Manager approves: the route sends the notice right after (`sendNotice`). */
export async function approveMeeting(ctx: AuthContext, meetingId: string): Promise<MeetingRow> {
  if (!canApprove(ctx.role)) throw forbidden();
  const { meeting } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.status !== 'pending_approval') throw conflict('not_pending');
  const [next] = await db
    .update(boardMeetings)
    .set({ status: 'approved', approvedAt: new Date(), approvedBy: ctx.userId, reviewNote: null, updatedAt: new Date() })
    .where(and(eq(boardMeetings.id, meeting.id), eq(boardMeetings.status, 'pending_approval')))
    .returning();
  if (!next) throw conflict('not_pending');
  await recordMeetingEvent(ctx.userId, next.id, next.version > 1 ? `Approved version ${next.version}` : 'Approved the notice');
  await recordAuditEvent(ctx, { engagementId: next.engagementId, action: 'board_meeting.approved', summary: `Approved the notice ${next.meetingNo}`, metadata: { meetingId: next.id, version: next.version } });
  await syncTask(next);
  return next;
}

export async function sendBackMeeting(ctx: AuthContext, meetingId: string, note: string): Promise<MeetingDto> {
  if (!canApprove(ctx.role)) throw forbidden();
  const text = note?.trim().slice(0, 2000);
  if (!text) throw invalid('note_required');
  const { meeting, engagement } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.status !== 'pending_approval') throw conflict('not_pending');
  const [next] = await db.update(boardMeetings).set({ status: 'draft', reviewNote: text, updatedAt: new Date() }).where(eq(boardMeetings.id, meeting.id)).returning();
  await recordMeetingEvent(ctx.userId, meeting.id, `Sent back: ${text}`);
  await syncTask(next!);
  await notifyMeeting(
    { userId: ctx.userId, name: ctx.name },
    { meeting: next!, companyName: companyInfoOf(engagement).name, title: `Notice sent back: ${meeting.meetingNo}`, body: text, recipientIds: [await leadProfileId(engagement)] },
  );
  return buildDto(ctx, next!, engagement);
}

/** After sending: new date and time go back to the manager; the update keeps the calendar UID. */
export async function rescheduleMeeting(ctx: AuthContext, meetingId: string, input: { meetingDate: string; meetingTime: string; reason: string }): Promise<MeetingDto> {
  const { meeting, engagement } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.status !== 'approved' && meeting.status !== 'sent') throw conflict('not_sent');
  if (!isIsoDate(input.meetingDate)) throw invalid('bad_date');
  if (!isHhmm(input.meetingTime)) throw invalid('bad_time');
  const reason = input.reason?.trim().slice(0, 500) || 'Rescheduled';
  const [next] = await db
    .update(boardMeetings)
    .set({
      rescheduledFrom: meeting.meetingDate,
      meetingDate: input.meetingDate,
      meetingTime: input.meetingTime,
      status: 'pending_approval',
      version: meeting.version + 1,
      reviewNote: null,
      submittedAt: new Date(),
      submittedBy: ctx.userId,
      updatedAt: new Date(),
    })
    .where(eq(boardMeetings.id, meeting.id))
    .returning();
  await db
    .insert(boardMeetingVersions)
    .values({ meetingId: next!.id, version: next!.version, actorId: ctx.userId, snapshot: { meetingDate: next!.meetingDate, meetingTime: next!.meetingTime, agenda: next!.agenda, bodyOverride: next!.bodyOverride, recipients: next!.recipients } })
    .onConflictDoNothing();
  // Replies were for the old date.
  await db.delete(boardMeetingReplies).where(eq(boardMeetingReplies.meetingId, meeting.id));
  await recordMeetingEvent(ctx.userId, meeting.id, `Rescheduled from ${shortDate(meeting.meetingDate)} to ${shortDate(input.meetingDate)}: ${reason}`);
  await syncTask(next!);
  await notifyMeeting(
    { userId: ctx.userId, name: ctx.name },
    { meeting: next!, companyName: companyInfoOf(engagement).name, title: `Approve the reschedule: ${meeting.meetingNo}`, body: `${shortDate(meeting.meetingDate)} → ${shortDate(input.meetingDate)}. ${reason}`, recipientIds: [managerProfileId(engagement)] },
  );
  return buildDto(ctx, next!, engagement);
}

/** Cancel: returns the row before and after so the route can email a cancellation if it was sent. */
export async function cancelMeeting(ctx: AuthContext, meetingId: string, reason: string): Promise<{ before: MeetingRow; after: MeetingRow }> {
  const { meeting } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.status === 'cancelled' || meeting.status === 'held') throw conflict('cannot_cancel');
  const text = reason?.trim().slice(0, 500) || 'Cancelled';
  const [next] = await db
    .update(boardMeetings)
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: text, icsSequence: meeting.icsSequence + 1, updatedAt: new Date() })
    .where(eq(boardMeetings.id, meeting.id))
    .returning();
  await recordMeetingEvent(ctx.userId, meeting.id, `Cancelled: ${text}`);
  await recordAuditEvent(ctx, { engagementId: meeting.engagementId, action: 'board_meeting.cancelled', summary: `Cancelled ${meeting.meetingNo}`, metadata: { meetingId: meeting.id, reason: text } });
  await syncTask(next!);
  return { before: meeting, after: next! };
}

/** The send step marks the meeting sent and locks the previous meeting's resolutions list. */
export async function systemMarkSent(meetingId: string, input: { noticeOn: string; shortNotice: boolean; teamsLink?: string | null; teamsEventId?: string | null; agenda: AgendaItem[]; bumpSequence: boolean }): Promise<MeetingRow | null> {
  const [m] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId)).limit(1);
  if (!m) return null;
  const [next] = await db
    .update(boardMeetings)
    .set({
      status: 'sent',
      sentAt: new Date(),
      noticeOn: input.noticeOn,
      shortNotice: input.shortNotice,
      agenda: input.agenda,
      icsSequence: input.bumpSequence ? m.icsSequence + 1 : m.icsSequence,
      ...(input.teamsLink !== undefined ? { teamsLink: input.teamsLink } : {}),
      ...(input.teamsEventId !== undefined ? { teamsEventId: input.teamsEventId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(boardMeetings.id, meetingId))
    .returning();
  if (!next) return null;
  const prev = await previousMeeting(next);
  if (prev && !prev.lockedAt) await db.update(boardMeetings).set({ lockedAt: new Date() }).where(eq(boardMeetings.id, prev.id));
  await syncTask(next);
  return next;
}

/** Everything the send step needs, after the route's access check. */
export async function systemMeetingBundle(meetingId: string): Promise<{ meeting: MeetingRow; engagement: EngagementDbRow; directors: DirectorRow[]; company: CompanyInfo } | null> {
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId)).limit(1);
  if (!meeting) return null;
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, meeting.engagementId)).limit(1);
  if (!engagement || engagement.deletedAt) return null;
  const directors = await directorsOfEngagement(engagement.id);
  return { meeting, engagement, directors, company: companyInfoOf(engagement) };
}

/** A director's reply from the signed email link (no session). */
export async function systemRecordReply(meetingId: string, directorId: string, reply: 'yes' | 'no', note?: string | null): Promise<{ meeting: MeetingRow; directorName: string } | null> {
  const bundle = await systemMeetingBundle(meetingId);
  if (!bundle) return null;
  const { meeting, directors } = bundle;
  if (meeting.status !== 'sent' && meeting.status !== 'approved') return null;
  if (!meeting.recipients.some((r) => r.directorId === directorId)) return null;
  const director = directors.find((d) => d.id === directorId);
  if (!director) return null;
  await db
    .insert(boardMeetingReplies)
    .values({ meetingId, directorId, reply, note: note?.trim().slice(0, 500) || null })
    .onConflictDoUpdate({ target: [boardMeetingReplies.meetingId, boardMeetingReplies.directorId], set: { reply, note: note?.trim().slice(0, 500) || null, repliedAt: new Date() } });
  await recordMeetingEvent(null, meetingId, `${director.name} replied: ${reply === 'yes' ? 'will attend' : "can't attend"}`);
  return { meeting, directorName: director.name };
}

/** Admin and manager Home card numbers. */
export async function meetingStats(ctx: AuthContext): Promise<{ in30: number; waiting: number; quorumAtRisk: number; momOverdue: number; limitSoon: number; attention: MeetingListRow[] }> {
  const rows = await listMeetings(ctx);
  const today = todayIst();
  const in30 = rows.filter((r) => r.status !== 'cancelled' && r.meetingDate >= today && r.meetingDate <= momDueDate(today)).length;
  const waiting = rows.filter((r) => r.status === 'pending_approval').length;
  const quorumAtRisk = rows.filter((r) => r.quorum && r.quorum.state !== 'ok' && r.meetingDate >= today).length;
  const momOverdue = rows.filter((r) => r.status === 'held' && r.momState !== 'locked' && today > r.momDue).length;
  const latest = new Map<string, MeetingListRow>();
  for (const r of rows) if (r.kind === 'board' && r.nextBy && !latest.has(r.engagementId)) latest.set(r.engagementId, r);
  const limitSoon = [...latest.values()].filter((r) => {
    const planned = rows.some((x) => x.engagementId === r.engagementId && x.kind === 'board' && x.status !== 'cancelled' && x.meetingDate > today);
    return !planned && r.nextBy! <= addDaysSafe(today, 14);
  }).length;
  const attention = rows
    .filter((r) => r.word === 'Overdue' || (r.quorum && r.quorum.state !== 'ok' && r.meetingDate >= today) || r.status === 'pending_approval')
    .slice(0, 6);
  return { in30, waiting, quorumAtRisk, momOverdue, limitSoon, attention };
}

function addDaysSafe(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Jobs: meetings whose notice is still a draft on or after T-10 (bell + email to the lead). */
export async function systemDraftsToPrepare(today: string): Promise<MeetingRow[]> {
  const rows = await db.select().from(boardMeetings).where(eq(boardMeetings.status, 'draft'));
  return rows.filter((m) => prepareDate(m.meetingDate) <= today && m.meetingDate >= today);
}

/** Jobs: held meetings whose MoM is not locked, with days since the meeting. */
export async function systemMomOpen(today: string): Promise<Array<{ meeting: MeetingRow; daysAfter: number }>> {
  const rows = await db.select().from(boardMeetings).where(inArray(boardMeetings.status, ['sent', 'held']));
  const past = rows.filter((m) => m.meetingDate < today);
  if (past.length === 0) return [];
  const docs = await db
    .select({ meetingId: boardMeetingDocuments.meetingId, status: boardMeetingDocuments.status })
    .from(boardMeetingDocuments)
    .where(and(inArray(boardMeetingDocuments.meetingId, past.map((m) => m.id)), eq(boardMeetingDocuments.kind, 'mom')));
  return past
    .filter((m) => !docs.some((d) => d.meetingId === m.id && d.status === 'locked'))
    .map((m) => ({ meeting: m, daysAfter: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${m.meetingDate}T00:00:00Z`)) / 86_400_000) }));
}

/** Jobs: sent meetings whose date has passed become held. */
export async function systemMarkHeld(today: string): Promise<number> {
  const rows = await db.select().from(boardMeetings).where(and(eq(boardMeetings.status, 'sent'), lt(boardMeetings.meetingDate, today)));
  for (const m of rows) await markHeldIfPast(m, today);
  return rows.length;
}

export { BoardMeetingError };

/** Who to tell about a meeting: its lead, manager and admin (system; caller checked access). */
export async function systemMeetingPeople(engagement: EngagementDbRow): Promise<{ lead: { id: string; name: string; email: string } | null; manager: { id: string; name: string; email: string } | null; admin: { id: string; name: string; email: string } | null }> {
  const leadId = await leadProfileId(engagement);
  const managerId = managerProfileId(engagement);
  const map = await peopleById([leadId, managerId, engagement.adminId]);
  const pick = (id: string | null | undefined) => {
    const p = id ? map.get(id) : null;
    return p ? { id: p.id, name: p.name, email: p.email } : null;
  };
  let admin = pick(engagement.adminId);
  if (!admin) {
    const all = await firmAdmins();
    const a = all.find((x) => x.role === 'admin') ?? all[0];
    admin = a ? { id: a.id, name: a.name, email: a.email } : null;
  }
  return { lead: pick(leadId), manager: pick(managerId), admin };
}

/** The reply page (no session): what one director sees for one meeting. */
export async function systemReplySummary(meetingId: string, directorId: string): Promise<{
  companyName: string;
  meetingNo: string;
  kindLabel: string;
  meetingDate: string;
  meetingTime: string;
  secondZone: string | null;
  mode: MeetingMode;
  venue: string;
  teamsLink: string | null;
  directorName: string;
  reply: 'yes' | 'no' | null;
  open: boolean;
} | null> {
  const bundle = await systemMeetingBundle(meetingId);
  if (!bundle) return null;
  const { meeting, directors, company } = bundle;
  if (!meeting.recipients.some((r) => r.directorId === directorId)) return null;
  const director = directors.find((d) => d.id === directorId);
  if (!director) return null;
  const [rep] = await db.select().from(boardMeetingReplies).where(and(eq(boardMeetingReplies.meetingId, meetingId), eq(boardMeetingReplies.directorId, directorId))).limit(1);
  return {
    companyName: company.name,
    meetingNo: meeting.meetingNo,
    kindLabel: KIND_LABEL[meeting.kind as MeetingKind] ?? 'Board meeting',
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    secondZone: meeting.secondZoneLabel && meeting.secondZoneTime ? `${meeting.secondZoneTime} ${meeting.secondZoneLabel}` : null,
    mode: meeting.mode as MeetingMode,
    venue: meeting.venue,
    teamsLink: meeting.teamsLink,
    directorName: director.name,
    reply: rep ? (rep.reply as 'yes' | 'no') : null,
    open: (meeting.status === 'sent' || meeting.status === 'approved') && meeting.meetingDate >= todayIst(),
  };
}
