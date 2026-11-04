'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { checklist, getActiveCatalogItems, type ChecklistItem } from '@/data/checklist';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { internOverviewPhaseForItem } from '@/lib/intern/intern-overview-progress';
import {
  adminProjectPath,
  adminProjectStepPath,
  clientIncorporationPath,
  clientIncorporationStepPath,
  internEngagementPath,
  internEngagementStepPath,
  isClientIncorporationStepPathname,
  isInternEngagementPathname,
} from '@/lib/projects/project-step-path';
import {
  engagementRouteParamFromParams,
  resolveChecklistItemFromStepParam,
  resolveEngagementFromRouteParam,
} from '@/lib/slug';
import { useDocPack } from '@/hooks/use-doc-pack';
import type { DocPackShell } from '@/lib/doc-pack/paths';
import { useBoardResolutionProgress } from '@/hooks/use-board-resolution-progress';
import { checklistGateViewerFrom, gateActiveCatalog, getStepGate } from '@/lib/checklist/checklist-step-gate';
import { findEngagementForClientUser } from '@/lib/checklist/checklist-state-key';

/**
 * The state of the shared checklist step page: the route it was opened on, the
 * engagement and step it resolves to, the checklist state and gates, and the
 * document pack. `EngagementStepDetail` renders from what this returns.
 */
export function useEngagementStepDetail() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const {
    engagements,
    tasks,
    activity,
    updateTask,
    getStateForEngagement,
    refreshEngagementChecklist,
    engagementsLoading,
    engagementsSettled,
    user,
  } = useApp();
  const [checklistRefreshing, setChecklistRefreshing] = useState(false);
  /* "What's this?" (S-487): the staff panel about this step. */
  const [aboutOpen, setAboutOpen] = useState(false);
  const queryClient = useQueryClient();

  const isClientRoute = isClientIncorporationStepPathname(pathname);
  const isInternRoute = isInternEngagementPathname(pathname);
  const isIntern = user?.role === 'intern' || isInternRoute;
  /**
   * Everyone but the lead reads. The client always did; admin and manager open
   * the same layout with the lead's filled fields locked, plus the Accept /
   * Reject pair when the step is waiting on their decision.
   */
  const readOnlyView = isClientRoute || !isIntern;
  const engagementParam = engagementRouteParamFromParams(params);
  const stepParam = params.stepId as string;
  const staffRole = user?.role === 'admin' || user?.role === 'manager' ? user.role : 'manager';

  const projectPath = isClientRoute
    ? () => clientIncorporationPath()
    : isInternRoute
      ? internEngagementPath
      : (p: Parameters<typeof adminProjectPath>[0]) => adminProjectPath(p, staffRole);
  const stepPath = isClientRoute
    ? (_p: unknown, step: string | ChecklistItem) => clientIncorporationStepPath(step)
    : isInternRoute
      ? internEngagementStepPath
      : (
          p: Parameters<typeof adminProjectStepPath>[0],
          step: Parameters<typeof adminProjectStepPath>[1],
        ) => adminProjectStepPath(p, step, staffRole);
  const listRedirect = isClientRoute
    ? clientIncorporationPath()
    : isInternRoute
      ? '/app/intern/clients'
      : staffRole === 'admin'
        ? '/app/admin/projects'
        : '/app/manager/projects';

  // The client route carries no `{id}`: a client has exactly one engagement, and
  // resolving it from the session is also what keeps the surface scoped.
  const eng = useMemo(
    () =>
      isClientRoute
        ? (user ? findEngagementForClientUser(engagements, user) : undefined)
        : resolveEngagementFromRouteParam(engagements, engagementParam),
    [engagements, engagementParam, isClientRoute, user],
  );
  const item = useMemo(
    () => resolveChecklistItemFromStepParam(stepParam),
    [stepParam],
  );
  const stepId = item?.id ?? stepParam;

  const eTasks = useMemo(
    () => tasks.filter((t) => t.engagementId === eng?.id),
    [tasks, eng?.id],
  );
  const task = eTasks.find((t) => t.checklistKey === stepId);
  const eActivity = useMemo(
    () => activity.filter((a) => a.engagementId === eng?.id).slice(0, 20),
    [activity, eng?.id],
  );

  const catalog = useMemo(() => getActiveCatalogItems(), []);
  const internPhase = useMemo(
    () => (item ? internOverviewPhaseForItem(item.id) : null),
    [item],
  );
  // The document pack is a staff surface for the two SPICe+ phases only.
  const docPackVisible =
    !isClientRoute &&
    (internPhase?.id === 'pre-inc-phase-1' || internPhase?.id === 'pre-inc-phase-2');
  const docPack = useDocPack(docPackVisible ? eng?.id : null);
  const docPackShell: DocPackShell = isInternRoute ? 'intern' : staffRole;
  const bucketSteps = useMemo(() => {
    if (!item) return [];
    const fromCatalog = catalog.filter((c) => c.bucket === item.bucket);
    if (fromCatalog.length > 0) return fromCatalog;
    return checklist.filter((c) => c.bucket === item.bucket).sort((a, b) => a.order - b.order);
  }, [item, catalog]);

  useEffect(() => {
    if (!eng?.id) return;
    let cancelled = false;
    setChecklistRefreshing(true);
    void refreshEngagementChecklist(eng.id).finally(() => {
      if (!cancelled) setChecklistRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eng?.id, refreshEngagementChecklist]);

  const checklistState = useMemo(
    () => (eng ? getStateForEngagement(eng) : {}),
    [getStateForEngagement, eng],
  );

  const responses = useMemo(() => {
    if (!item) return undefined;
    return extractItemResponses(item, checklistState[item.id]);
  }, [item, checklistState]);

  const { snapshot: brSnapshot } = useBoardResolutionProgress(eng?.id);
  const viewer = checklistGateViewerFrom(
    isClientRoute ? 'client' : 'admin',
    isIntern ? 'intern' : user?.role,
  );
  const gates = useMemo(
    () => gateActiveCatalog(checklistState, viewer),
    [checklistState, viewer],
  );
  const stepGate = item ? getStepGate(gates, item.id) : undefined;

  return {
    router,
    queryClient,
    user,
    updateTask,
    refreshEngagementChecklist,
    engagementsLoading,
    engagementsSettled,
    checklistRefreshing,
    aboutOpen,
    setAboutOpen,
    isClientRoute,
    isInternRoute,
    isIntern,
    readOnlyView,
    engagementParam,
    stepParam,
    projectPath,
    stepPath,
    listRedirect,
    eng,
    item,
    eTasks,
    task,
    eActivity,
    catalog,
    internPhase,
    docPackVisible,
    docPack,
    docPackShell,
    bucketSteps,
    checklistState,
    responses,
    brSnapshot,
    gates,
    stepGate,
  };
}
