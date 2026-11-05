import 'server-only';

/**
 * BOARD MEETINGS — directors, meetings, documents and the agenda library
 * (docs/specs/board-meetings/PLAN.md). Split by concern; this file keeps one import path.
 * Access rules: `shared.ts`.
 */
export { BoardMeetingError, meetingHref, notifyMeeting } from './shared';
export type { CompanyInfo } from './shared';
export { listDirectors, addDirector, updateDirector, ceaseDirector } from './directors';
export type { DirectorDto, DirectorInput } from './directors';
export {
  listMeetings,
  getMeeting,
  createMeeting,
  updateMeeting,
  submitMeeting,
  approveMeeting,
  sendBackMeeting,
  rescheduleMeeting,
  cancelMeeting,
  meetingStats,
  finalAgenda,
  noticeFor,
  systemMarkSent,
  systemMeetingBundle,
  systemRecordReply,
  systemDraftsToPrepare,
  systemMomOpen,
  systemMarkHeld,
  systemMeetingPeople,
  systemReplySummary,
} from './meetings';
export type { MeetingDto, MeetingListRow, MeetingDocumentDto, ReplyDto, CreateMeetingInput, UpdateMeetingInput } from './meetings';
export {
  uploadMom,
  createResolution,
  updateResolution,
  markSentForSignature,
  uploadSigned,
  documentFileUrl,
  systemDocument,
  systemMarkFinalSent,
} from './documents';
export type { ResolutionInput, UploadedFile } from './documents';
export { listLibrary, updateLibraryItem, importLibrary, listTemplates, saveTemplate, deleteTemplate } from './library';
export type { LibraryItemDto, TemplateDto } from './library';
