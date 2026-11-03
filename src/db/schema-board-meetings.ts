/**
 * Board meetings after incorporation (2 Nov 2026, docs/specs/board-meetings/PLAN.md).
 * Re-exported from src/db/schema.ts so drizzle-kit and the repositories see one schema.
 * Additive only: new tables, plus the nullable `compliance_tasks.board_meeting_id` link in
 * schema-compliance-tasks.ts.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `profiles` and
 * `engagements` may only be touched lazily, inside `.references(() => base.x.id)` callbacks.
 *
 * Tables:
 *  - company_directors              — a company's directors over time (appointed, ceased). The
 *                                     director picker of every notice reads the current ones.
 *  - board_meetings                 — one meeting: notice, agenda, recipients, approval, send.
 *  - board_meeting_events           — its activity log (who did what, versions).
 *  - board_meeting_versions         — a snapshot of the notice at each saved edit after submit.
 *  - board_meeting_replies          — "I will attend / I can't attend" per director.
 *  - board_meeting_documents        — the MoM and resolutions added after the meeting.
 *  - board_meeting_signature_events — the signature log per document and director.
 *  - agenda_library_items           — the SBC agenda master (seeded from src/data).
 *  - agenda_templates               — saved agendas (firm-wide or one client).
 */
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';
import type { AgendaItem, MeetingRecipient } from '@/lib/board-meetings/model';

export const companyDirectors = pgTable(
  'company_directors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    din: text('din'),
    email: text('email'),
    phone: text('phone'),
    designation: text('designation').notNull().default('Director'),
    appointedOn: date('appointed_on'),
    ceasedOn: date('ceased_on'),
    /** resigned | removed | disqualified | other. */
    ceaseReason: text('cease_reason'),
    /** incorporation (copied from the checklist) | manual. */
    source: text('source').notNull().default('manual'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('company_directors_engagement_idx').on(t.engagementId),
  }),
);

export const boardMeetings = pgTable(
  'board_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** board | agm | egm. */
    kind: text('kind').notNull().default('board'),
    /** first | quarterly | annual | special. */
    meetingType: text('meeting_type').notNull().default('quarterly'),
    /** Number of this kind of meeting in its financial year (1, 2, …). */
    seq: integer('seq').notNull(),
    meetingNo: text('meeting_no').notNull(),
    meetingDate: date('meeting_date').notNull(),
    /** HH:MM, 24-hour IST. */
    meetingTime: text('meeting_time').notNull(),
    secondZoneLabel: text('second_zone_label'),
    secondZoneTime: text('second_zone_time'),
    /** vc | in_person | hybrid. */
    mode: text('mode').notNull().default('vc'),
    venue: text('venue').notNull().default(''),
    /** draft | pending_approval | approved | sent | held | cancelled. */
    status: text('status').notNull().default('draft'),
    /** Notice version; +1 at each edit after the first submit. */
    version: integer('version').notNull().default(1),
    agenda: jsonb('agenda').$type<AgendaItem[]>().notNull().default([]),
    /** Edited body paragraphs; null = the standard wording. */
    bodyOverride: jsonb('body_override').$type<string[] | null>(),
    recipients: jsonb('recipients').$type<MeetingRecipient[]>().notNull().default([]),
    signatoryDirectorId: uuid('signatory_director_id').references(() => companyDirectors.id, { onDelete: 'set null' }),
    teamsLink: text('teams_link'),
    teamsEventId: text('teams_event_id'),
    /** The .ics SEQUENCE; +1 at each reschedule or cancel after sending. */
    icsSequence: integer('ics_sequence').notNull().default(0),
    /** The first board meeting of post-incorporation step post-1. */
    postInc: boolean('post_inc').notNull().default(false),
    /** The date printed on the notice (the day it is sent). */
    noticeOn: date('notice_on'),
    shortNotice: boolean('short_notice').notNull().default(false),
    reviewNote: text('review_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    rescheduledFrom: date('rescheduled_from'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    /** Set when the next meeting's notice is sent: no more resolutions here. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    /** The compliance task that shows the meeting in Obligations, Today and the calendar. */
    taskId: uuid('task_id'),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engDateIdx: index('board_meetings_engagement_date_idx').on(t.engagementId, t.meetingDate),
    noIdx: uniqueIndex('board_meetings_engagement_no_idx').on(t.engagementId, t.meetingNo),
  }),
);

export const boardMeetingEvents = pgTable(
  'board_meeting_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    /** Shown to staff; clients never read events. */
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    meetingIdx: index('board_meeting_events_meeting_idx').on(t.meetingId, t.createdAt),
  }),
);

export interface MeetingSnapshot {
  meetingDate: string;
  meetingTime: string;
  agenda: AgendaItem[];
  bodyOverride: string[] | null;
  recipients: MeetingRecipient[];
}

export const boardMeetingVersions = pgTable(
  'board_meeting_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<MeetingSnapshot>().notNull(),
    actorId: uuid('actor_id').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    meetingIdx: uniqueIndex('board_meeting_versions_meeting_version_idx').on(t.meetingId, t.version),
  }),
);

export const boardMeetingReplies = pgTable(
  'board_meeting_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id, { onDelete: 'cascade' }),
    directorId: uuid('director_id')
      .notNull()
      .references(() => companyDirectors.id, { onDelete: 'cascade' }),
    /** yes | no. */
    reply: text('reply').notNull(),
    note: text('note'),
    repliedAt: timestamp('replied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneIdx: uniqueIndex('board_meeting_replies_meeting_director_idx').on(t.meetingId, t.directorId),
  }),
);

export const boardMeetingDocuments = pgTable(
  'board_meeting_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id, { onDelete: 'cascade' }),
    /** mom | resolution. */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    /** The date of a resolution added after the meeting. */
    resolutionDate: date('resolution_date'),
    /** The decision of the meeting this resolution changes (free text, e.g. "Item 5"). */
    changesItem: text('changes_item'),
    reason: text('reason'),
    /** company_directors ids who must sign. */
    signerIds: jsonb('signer_ids').$type<string[]>().notNull().default([]),
    /** draft | sent | locked. */
    status: text('status').notNull().default('draft'),
    fileKey: text('file_key'),
    fileName: text('file_name'),
    signedKey: text('signed_key'),
    signedName: text('signed_name'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    finalSentAt: timestamp('final_sent_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    meetingIdx: index('board_meeting_documents_meeting_idx').on(t.meetingId, t.kind),
  }),
);

export const boardMeetingSignatureEvents = pgTable(
  'board_meeting_signature_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => boardMeetingDocuments.id, { onDelete: 'cascade' }),
    directorId: uuid('director_id').references(() => companyDirectors.id, { onDelete: 'set null' }),
    /** sent | opened | reminded | signed | final_sent. */
    event: text('event').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index('board_meeting_signature_events_doc_idx').on(t.documentId, t.createdAt),
  }),
);

export const agendaLibraryItems = pgTable('agenda_library_items', {
  /** 'BM-001'. */
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  scenario: text('scenario').notNull(),
  wording: text('wording').notNull(),
  law: text('law').notNull().default(''),
  applicability: text('applicability').notNull().default(''),
  action: text('action').notNull().default(''),
  notes: text('notes').notNull().default(''),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  updatedBy: uuid('updated_by').references(() => base.profiles.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agendaTemplates = pgTable(
  'agenda_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null = a firm template; otherwise one client's template. */
    engagementId: uuid('engagement_id').references(() => base.engagements.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    meetingType: text('meeting_type').notNull(),
    agenda: jsonb('agenda').$type<AgendaItem[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engIdx: index('agenda_templates_engagement_idx').on(t.engagementId),
  }),
);
