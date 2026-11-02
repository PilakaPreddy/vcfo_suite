/**
 * The wire types of the board meeting routes, for client code. Type-only re-exports: nothing
 * from the repositories reaches the browser bundle.
 */
export type {
  MeetingDto,
  MeetingListRow,
  MeetingDocumentDto,
  ReplyDto,
  DirectorDto,
  LibraryItemDto,
  TemplateDto,
} from '@/db/repositories/board-meetings';
