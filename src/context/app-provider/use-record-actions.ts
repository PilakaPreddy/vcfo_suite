import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Client } from '@/data/client';
import type { AppContextValue } from '@/context/AppContext';
import {
  type Engagement,
  type TaskInstance,
  type DocRequest,
  seedTasksFor,
} from '@/data/engagements';
import { type AuthUser, initialsFromName, isAdminOrManager } from '@/lib/auth';
import { createProjectWithClient, updateEngagementInDb } from '@/lib/projects/engagements-db';
import { toastEmailDispatch } from '@/lib/toast-errors';
import type { EmailDispatchResult } from '@/lib/email/email-dispatch';
import { fetchJson } from './fetch-json';
import type { AppProviderStore } from './state';
import type { ActivityFeed } from './use-activity-feed';

type RecordActionsParams = {
  user: AuthUser | null;
  queryClient: QueryClient;
  requests: DocRequest[];
} & Pick<AppProviderStore, 'setClients' | 'setEngagements' | 'setTasks' | 'setRequests'> &
  Pick<ActivityFeed, 'pushActivity'>;

/** Projects, tasks and document requests: optimistic local edits synced to the API. */
export function useRecordActions({
  user,
  queryClient,
  requests,
  setClients,
  setEngagements,
  setTasks,
  setRequests,
  pushActivity,
}: RecordActionsParams) {
  const createProjectWithClientFn = useCallback<AppContextValue['createProjectWithClient']>(async (input) => {
    if (!isAdminOrManager(user?.role)) {
      throw new Error('Only admins or project managers can create projects and provision client accounts.');
    }
    const result = await createProjectWithClient(input);
    const { engagement, clientId } = result;
    const initials = initialsFromName(input.companyName);
    const client: Client = {
      id: clientId,
      name: input.clientName || input.companyName,
      initials,
      stage: engagement.stage,
      unread: 0,
      incorporationDate: null,
      nature: 'IT Services',
      shareCapital: 0,
    };
    setClients((p) => [...p, client]);
    setEngagements((p) => [engagement, ...p]);
    const seeded = seedTasksFor(engagement.id, engagement.stage);
    setTasks((p) => [...p, ...seeded]);
    for (const t of seeded) {
      void fetchJson('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          engagementId: t.engagementId,
          checklistKey: t.checklistKey,
          status: t.status,
          assigneeId: t.assigneeId,
          dueAt: t.dueAt,
          notes: t.notes,
          title: t.checklistKey,
        }),
      }).catch(() => {});
    }
    void queryClient.invalidateQueries({ queryKey: ['tasks', user?.id] });
    pushActivity({
      actor: user?.name || 'Admin',
      verb: 'created project',
      target: engagement.companyName,
      engagementId: engagement.id,
    });
    return result;
  }, [user, pushActivity, setClients, setEngagements, setTasks, queryClient]);

  const updateEngagementFn = useCallback<AppContextValue['updateEngagement']>(async (id, patch) => {
    const updated = await updateEngagementInDb(id, patch);
    if (updated) {
      setEngagements((p) => p.map((e) => (e.id === id ? updated : e)));
      return updated;
    }
    throw new Error('Project not found or could not be updated.');
  }, [setEngagements]);

  const updateTask = useCallback<AppContextValue['updateTask']>(
    (taskId, patch) => {
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
      void fetchJson<{ task: TaskInstance }>(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
        .then((data) => {
          setTasks((p) => p.map((t) => (t.id === taskId ? data.task : t)));
          void queryClient.invalidateQueries({ queryKey: ['tasks', user?.id] });
        })
        .catch(() => {});
    },
    [setTasks, queryClient, user?.id],
  );

  const uploadDoc = useCallback<AppContextValue['uploadDoc']>(
    (requestId, fileName) => {
      const uploadedAt = new Date().toISOString().slice(0, 10);
      setRequests((p) =>
        p.map((r) =>
          r.id === requestId
            ? { ...r, status: 'uploaded', fileName, uploadedAt }
            : r,
        ),
      );
      void fetchJson<{ request: DocRequest; email?: EmailDispatchResult }>(`/api/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'uploaded', fileName, uploadedAt }),
      })
        .then((data) => {
          setRequests((p) => p.map((r) => (r.id === requestId ? data.request : r)));
          void queryClient.invalidateQueries({ queryKey: ['requests', user?.id] });
          toastEmailDispatch(data.email, { engagementId: data.request.engagementId, href: '#' });
        })
        .catch(() => {});
      const req = requests.find((r) => r.id === requestId);
      if (req) pushActivity({ actor: user?.name || 'Client', verb: 'uploaded', target: req.label, engagementId: req.engagementId });
    },
    [requests, user?.name, user?.id, pushActivity, setRequests, queryClient],
  );

  const approveDoc = useCallback<AppContextValue['approveDoc']>(
    (requestId) => {
      setRequests((p) => p.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r)));
      void fetchJson<{ request: DocRequest }>(`/api/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      })
        .then((data) => {
          setRequests((p) => p.map((r) => (r.id === requestId ? data.request : r)));
          void queryClient.invalidateQueries({ queryKey: ['requests', user?.id] });
        })
        .catch(() => {});
    },
    [setRequests, queryClient, user?.id],
  );

  const createRequest = useCallback<AppContextValue['createRequest']>(
    ({ engagementId, taskId, label, message, dueAt }) => {
      const id = `r${Date.now()}`;
      const r: DocRequest = {
        id,
        engagementId,
        taskId,
        label,
        status: 'pending',
        message,
        dueAt,
        requestedBy: user?.id || 'tm1',
      };
      setRequests((p) => [...p, r]);
      void fetchJson<{ request: DocRequest; email?: EmailDispatchResult }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({ engagementId, taskId, label, message, dueAt }),
      })
        .then((data) => {
          setRequests((p) => p.map((row) => (row.id === id ? data.request : row)));
          void queryClient.invalidateQueries({ queryKey: ['requests', user?.id] });
          toastEmailDispatch(data.email, { engagementId, href: '#' });
        })
        .catch(() => {});
      pushActivity({ actor: user?.name || 'Project Lead', verb: 'requested', target: label, engagementId });
      return r;
    },
    [user?.id, user?.name, pushActivity, setRequests, queryClient],
  );

  return {
    createProjectWithClientFn,
    updateEngagementFn,
    updateTask,
    uploadDoc,
    approveDoc,
    createRequest,
  };
}
