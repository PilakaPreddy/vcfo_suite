"use client";

import { use, type SetStateAction } from 'react';
import type { Client } from '@/data/client';
import { StatusCode } from '@/data/checklist';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import type { ClientFillRequest } from '@/lib/checklist/checklist-state-key';
import {
  Engagement,
  TaskInstance,
  DocRequest,
  ActivityEvent,
} from '@/data/engagements';
import { AuthUser, Role } from '@/lib/auth';
import {
  type CreateProjectResult,
  type CreateProjectInput,
  type InternOption,
  type UpdateEngagementInput,
} from '@/lib/projects/engagements-db';
import {
  type AppNotification,
  type NotificationKind,
} from '@/lib/checklist/checklist-notifications';
import type { SidebarMode } from '@/components/shell/intern-sidebar';

export type { SidebarMode };

export interface ChecklistItemState {
  status: StatusCode;
  assigneeId?: string;
  notes?: string;
  completedOn?: string;
  responses?: ChecklistItemResponses;
  clientSubmittedAt?: string;
  locked?: boolean;
  unlockedFields?: string[];
  reviewStatus?: 'reviewing' | 'accepted' | 'rejected';
  reviewSource?: 'client_submission' | 'lead_manager_request';
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionNote?: string;
  deliveredToClientAt?: string;
  /** Incorporation draft row keys (`doc:director`) shared with client on Pre-8 */
  sharedIncorpDraftDocs?: string[];
  incorpDraftsSharedAt?: string;
  /** Statutory registration 3-step workflow (Client → VCFO → Department) */
  workflowStage?: 'collection' | 'filing' | 'approval';
  /** Lead → manager → client "please fill this step" request. */
  clientFillRequest?: ClientFillRequest;
  /** Pre-incorporation direct flow stamps (see `src/lib/incorporation/pre-inc-direct-flow.ts`). */
  submittedByName?: string;
  submittedByRole?: string;
  waitingOnLeadAt?: string;
  waitingOnLeadByName?: string;
  lastEditedAt?: string;
  lastEditedByName?: string;
  lastEditedByRole?: string;
}

type ChecklistItemPatch = Partial<ChecklistItemState> & {
  /** Lead → manager approval mail retry; not persisted on the item. */
  resendManagerEmail?: boolean;
};

interface UpdateItemOptions {
  /** When true, only `responses` is applied (client portal). */
  clientResponsesOnly?: boolean;
  /** Let the request outlive the page (unload / tab close flush of a draft). */
  keepalive?: boolean;
}

interface SignInResult {
  user?: AuthUser;
  error?: string;
}

export interface AppContextValue {
  user: AuthUser | null;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signInAsClient: (clientId: string, name: string) => AuthUser;
  signOut: () => Promise<void>;
  /** Re-read Auth.js session into app user (e.g. after profile edit). */
  refreshAuth: () => Promise<void>;

  clients: Client[];
  engagements: Engagement[];
  tasks: TaskInstance[];
  requests: DocRequest[];
  activity: ActivityEvent[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotifications: (items: AppNotification[]) => void;
  restoreNotifications: (items: AppNotification[]) => void;
  /** Suppress duplicate realtime notification after a local checklist mutation. */
  suppressChecklistNotification: (engagementId: string, itemId: string, kind: NotificationKind) => void;
  teamMembers: InternOption[];

  createProjectWithClient: (input: CreateProjectInput) => Promise<CreateProjectResult>;
  updateEngagement: (id: string, patch: UpdateEngagementInput) => Promise<Engagement | null>;
  internOptions: InternOption[];
  internsLoading: boolean;
  engagementsLoading: boolean;
  /**
   * The engagements query has actually resolved (success or error). Distinct
   * from `engagementsLoading`: that query is `enabled: Boolean(user)`, so while
   * the session hydrates it reports `isLoading === false` with an empty list —
   * which made "no engagement" look true before anything had been fetched.
   */
  engagementsSettled: boolean;
  updateTask: (taskId: string, patch: Partial<TaskInstance>) => void;
  uploadDoc: (requestId: string, fileName: string) => void;
  approveDoc: (requestId: string) => void;
  createRequest: (input: { engagementId: string; taskId: string; label: string; message?: string; dueAt?: string }) => DocRequest;

  sidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SetStateAction<SidebarMode>) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;

  role: Role;
  selectedClient: Client | null;
  setSelectedClient: (c: Client | null) => void;
  addClient: (c: Omit<Client, 'id' | 'initials' | 'unread'>) => Client;
  /** Resolve checklist state by engagement id or legacy client_id scope. */
  getState: (scopeId: string) => Record<string, ChecklistItemState>;
  /** Checklist item state for an engagement (from Supabase checklist_state). */
  getStateForEngagement: (engagement: Engagement) => Record<string, ChecklistItemState>;
  updateItem: (
    scopeId: string,
    itemId: string,
    patch: ChecklistItemPatch,
    options?: UpdateItemOptions,
  ) => Promise<void>;
  /** Client submits milestone responses for VCFO review (locks fields). */
  submitChecklistItem: (
    scopeId: string,
    itemId: string,
    responses: ChecklistItemResponses,
  ) => Promise<void>;
  /**
   * Pre-incorporation direct flow: the client or the project lead submits a
   * step. Resolves with the outcome; `invalid` carries the server's field errors.
   */
  submitDirectStep: (
    scopeId: string,
    itemId: string,
    responses: ChecklistItemResponses,
  ) => Promise<{
    outcome: 'submitted' | 'waiting_on_lead' | 'invalid';
    fieldErrors?: Record<string, string>;
  }>;
  /** Intern/manager reopens specific fields for client editing after submit. */
  setUnlockedFields: (
    scopeId: string,
    itemId: string,
    fieldIds: string[],
  ) => Promise<void>;
  /** Intern/manager accepts or rejects a client submission. */
  reviewChecklistItem: (
    scopeId: string,
    itemId: string,
    action: 'accept' | 'reject',
    note?: string,
  ) => Promise<void>;
  /**
   * Lead asks the client to fill a step, or a manager approves / declines it.
   * Nothing reaches the client until a manager approves.
   */
  setClientFillRequest: (
    scopeId: string,
    itemId: string,
    action: 'request' | 'approve' | 'decline',
    note?: string,
  ) => Promise<void>;
  /** Reload checklist_state from Supabase for one engagement (admin project detail). */
  refreshEngagementChecklist: (engagementId: string) => Promise<void>;
  /** Optimistically merge response fields into local checklist state (e.g. after doc generate). */
  mergeEngagementChecklistResponses: (
    engagementId: string,
    itemId: string,
    responses: ChecklistItemResponses,
  ) => void;
}

export { AppProvider } from '@/context/AppProvider';

import { AppContext as AppContextStore } from '@/context/app-context-store';

export function useApp() {
  const ctx = use(AppContextStore);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
