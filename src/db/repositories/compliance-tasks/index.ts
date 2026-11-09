import 'server-only';

/**
 * COMPLIANCE TASKS — the non-statutory occurrences (docs/ui-port/COMPLIANCE-API.md section 2).
 * Split by concern; this file keeps one import path. Access rules: `shared.ts`.
 */
export { ComplianceTaskError } from './shared';
export { listTasks, getTask, taskDefaults, taskCounts } from './read';
export type { TaskRowDto, TaskDetailDto, TaskListQuery, TaskDefaultsDto } from './read';
export {
  createTask,
  changeTaskStage,
  editTask,
  reviewTask,
  addChecklistItem,
  setChecklistItem,
  deleteChecklistItem,
  addTaskComment,
} from './write';
export type { CreateTaskInput, EditTaskInput, ChecklistItemDto, CommentDto } from './write';
export { addTaskAttachment, getTaskAttachmentUrl, markTaskDeliverable, removeTaskAttachment, TASK_ATTACHMENT_MAX_BYTES } from './attachments';
export type { AttachmentDto } from './attachments';
export { systemCreateNextOccurrence, systemRepeatSweep } from './repeat';
