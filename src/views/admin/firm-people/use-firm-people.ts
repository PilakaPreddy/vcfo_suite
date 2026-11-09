import { useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { toastError, toastSuccess, errorMessage } from '@/lib/toast-errors';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import { isFirmWideAdmin } from '@/lib/auth';
import {
  TEMP_PASSWORD,
  type PersonRole,
  type StaffRow,
  type RemovedClientRow,
  fetchJson,
  type FormState,
  formReducer,
  ROLE_LABEL,
} from './types';

/**
 * State and actions for the People page: the people, leads and clients
 * queries, the create / delete / change-email / assign-project flows, the
 * portfolio summary and the selected manager.
 */
export function useFirmPeople() {
  const { engagements, user, teamMembers, getStateForEngagement, updateEngagement } = useApp();
  const staffBase = useStaffBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** The person waiting on the typed DELETE confirm (B-14). */
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  /** The person waiting on the typed RESET confirm for two-step sign-in. */
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [emailTarget, setEmailTarget] = useState<StaffRow | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<StaffRow | null>(null);
  const [assignProjectId, setAssignProjectId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [reportingSaving, setReportingSaving] = useState<string | null>(null);
  const isAdmin = isFirmWideAdmin(user?.role);
  const isSuperAdmin = user?.role === 'super_admin';
  const isManager = user?.role === 'manager';
  const canCreate = isAdmin || isManager;
  // Developer accounts reach only the developer console; only the super admin may create one.
  const createRoles: PersonRole[] = isSuperAdmin
    ? ['admin', 'manager', 'intern', 'developer']
    : isAdmin
      ? ['admin', 'manager', 'intern']
      : ['intern'];
  const selectedManagerId = searchParams.get('managerId');

  const peopleQuery = useQuery({
    queryKey: ['admin-people'],
    queryFn: async () => {
      const data = await fetchJson<{ people: StaffRow[] }>('/api/admin/people');
      return data.people;
    },
    enabled: isAdmin,
  });

  /** Which firm admin each project manager reports to (G-20). */
  const reportingQuery = useQuery({
    queryKey: ['admin-reporting-lines'],
    queryFn: async () => {
      const data = await fetchJson<{ lines: { managerId: string; adminId: string | null }[] }>(
        '/api/admin/people/reporting',
      );
      return data.lines;
    },
    enabled: isAdmin,
  });

  const internsQuery = useQuery({
    queryKey: ['admin-interns'],
    queryFn: async () => {
      const data = await fetchJson<{
        interns: {
          id: string;
          profileId: string;
          name: string;
          email: string;
          reportsToManagerId?: string | null;
        }[];
      }>('/api/admin/interns');
      return data.interns;
    },
    enabled: isManager,
  });

  const clientsQuery = useQuery({
    queryKey: ['admin-clients'],
    queryFn: async () => {
      const data = await fetchJson<{
        clients: { id: string; name: string; email: string; clientId: string | null }[];
      }>('/api/admin/clients');
      return data.clients;
    },
    enabled: canCreate,
  });

  const removedClientsQuery = useQuery({
    queryKey: ['admin-removed-clients'],
    queryFn: async () => {
      const data = await fetchJson<{ clients: RemovedClientRow[] }>(
        '/api/admin/clients/removed',
      );
      return data.clients;
    },
    enabled: canCreate,
  });

  const [form, dispatch] = useReducer(formReducer, {
    name: '',
    email: '',
    password: TEMP_PASSWORD,
    role: (isAdmin ? 'manager' : 'intern') as PersonRole,
    reportsToManagerId: '',
    reportsToAdminId: '',
    submitting: false,
  } satisfies FormState);

  useEffect(() => {
    if (!createOpen) return;
    dispatch({
      type: 'patch',
      patch: {
        password: TEMP_PASSWORD,
        role: isAdmin ? (form.role === 'client' ? 'intern' : form.role) : 'intern',
      },
    });
    setShowPassword(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset credentials when dialog opens
  }, [createOpen]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    if (!createRoles.includes(form.role as (typeof createRoles)[number])) {
      toastError('You cannot create that role.');
      return;
    }
    if (isAdmin && form.role === 'intern' && !form.reportsToManagerId) {
      toastError('Assign a project manager for this lead.');
      return;
    }
    dispatch({ type: 'patch', patch: { submitting: true } });
    try {
      if (form.role === 'developer') {
        await fetchJson('/api/admin/people/developers', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim() || undefined,
            email: form.email.trim(),
            password: form.password || TEMP_PASSWORD,
          }),
        });
        toastSuccess(`${ROLE_LABEL[form.role]} created`, form.email);
        dispatch({ type: 'reset' });
        setCreateOpen(false);
        await queryClient.invalidateQueries({ queryKey: ['admin-people'] });
        return;
      }
      const created = await fetchJson<{ userId?: string }>('/api/admin/people', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          email: form.email.trim(),
          password: form.password || TEMP_PASSWORD,
          role: form.role,
          reportsToManagerId:
            form.role === 'intern' && isAdmin ? form.reportsToManagerId || undefined : undefined,
        }),
      });
      // A new manager's admin goes through the existing reporting route (G-20). The account
      // exists already, so a failure here only leaves the line unset; the row picker can fix it.
      if (form.role === 'manager' && isAdmin && form.reportsToAdminId && created.userId) {
        try {
          await fetchJson('/api/admin/people/reporting', {
            method: 'PATCH',
            body: JSON.stringify({ managerId: created.userId, adminId: form.reportsToAdminId }),
          });
          await queryClient.invalidateQueries({ queryKey: ['admin-reporting-lines'] });
        } catch (err) {
          toastError('Manager created, but the admin was not set', errorMessage(err));
        }
      }
      toastSuccess(`${ROLE_LABEL[form.role]} created`, form.email);
      dispatch({ type: 'reset' });
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-people'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-interns'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-removed-clients'] });
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      dispatch({ type: 'patch', patch: { submitting: false } });
    }
  }

  /** Opens the typed confirm; the delete itself runs in `confirmDelete`. */
  function onDelete(person: StaffRow) {
    if (person.id === user?.id) {
      toastError('You cannot delete your own account.');
      return;
    }
    setDeleteTarget(person);
  }

  async function confirmDelete(person: StaffRow) {
    setDeletingId(person.id);
    try {
      await fetchJson(`/api/admin/people/${person.id}`, { method: 'DELETE' });
      toastSuccess('Account deleted', person.email);
      await queryClient.invalidateQueries({ queryKey: ['admin-people'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-interns'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-removed-clients'] });
      if (selectedManagerId === person.id) {
        router.replace(`${staffBase}/people`);
      }
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  /** Turns off another person's two-step sign-in (`POST /api/account/two-step/reset`). */
  async function confirmResetTwoStep(person: StaffRow) {
    try {
      await fetchJson('/api/account/two-step/reset', {
        method: 'POST',
        body: JSON.stringify({ profileId: person.id }),
      });
      toastSuccess('Two-step sign-in reset', person.email);
      await queryClient.invalidateQueries({ queryKey: ['admin-people'] });
    } catch (err) {
      toastError('Could not reset two-step sign-in', errorMessage(err));
    }
  }

  function openChangeEmail(person: StaffRow) {
    setEmailTarget(person);
    setEmailDraft(person.email);
  }

  function closeChangeEmail() {
    setEmailTarget(null);
    setEmailDraft('');
  }

  async function onChangeEmail() {
    if (!emailTarget) return;
    const next = emailDraft.trim().toLowerCase();
    if (!next || !next.includes('@')) {
      toastError('Enter a valid email.');
      return;
    }
    setEmailSaving(true);
    try {
      await fetchJson(`/api/admin/people/${emailTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: next }),
      });
      toastSuccess('Email updated', next);
      closeChangeEmail();
      await queryClient.invalidateQueries({ queryKey: ['admin-people'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-interns'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-removed-clients'] });
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setEmailSaving(false);
    }
  }

  const people = peopleQuery.data ?? [];
  const admins = people.filter((p) => p.role === 'admin' || p.role === 'super_admin');
  // Developer accounts reach only the developer console; the super admin alone sees and makes them.
  const developers = isSuperAdmin ? people.filter((p) => p.role === 'developer') : [];
  const managers: StaffRow[] = isAdmin
    ? people.filter((p) => p.role === 'manager')
    : [];
  const leads: StaffRow[] = isAdmin
    ? people.filter((p) => p.role === 'intern')
    : (internsQuery.data ?? []).map((m) => ({
        id: m.profileId || m.id,
        name: m.name,
        email: m.email,
        role: 'intern' as const,
        internId: m.id,
        reportsToManagerId: m.reportsToManagerId ?? user?.id ?? null,
      }));
  const clients: StaffRow[] = isAdmin
    ? people.filter((p) => p.role === 'client' && p.status !== 'removed')
    : (clientsQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        role: 'client' as const,
        clientId: c.clientId,
      }));

  const removedClients: RemovedClientRow[] = removedClientsQuery.data ?? [];

  const portfolio = useMemo(() => {
    const active = engagements.filter((e) => e.stage !== 'Operational Readiness');
    const rows = active.map((e) => {
      const reason = deriveStuckReason(e, getStateForEngagement(e));
      return {
        id: e.id,
        slug: e.slug,
        company: e.companyName,
        client: e.clientDisplayName || e.clientEmail || 'Client',
        clientUserId: e.clientUserId,
        stage: e.stage,
        managerId: e.managerId ?? e.adminId,
        leadId: e.internId,
        health: e.health,
        stuck: reason !== 'on_track',
        stuckReason: reason,
      };
    });
    return {
      projectCount: rows.length,
      clientCount: new Set(rows.map((e) => e.clientUserId || e.client)).size,
      rows,
    };
  }, [engagements, getStateForEngagement]);

  // A manager's lists hold only their own team, so a project can name a lead or manager who is not
  // in them (or the manager themself). Look in every list the page has, then say so in words; an
  // id is never shown as a name.
  const leadName = (id: string | null | undefined) => {
    if (!id) return '—';
    return (
      teamMembers.find((t) => t.id === id)?.name ??
      leads.find((l) => l.internId === id || l.id === id)?.name ??
      people.find((p) => p.internId === id || p.id === id)?.name ??
      'Another team'
    );
  };

  const managerName = (id: string | null | undefined) => {
    if (!id) return '—';
    if (id === user?.id) return user.name;
    return managers.find((m) => m.id === id)?.name ?? people.find((p) => p.id === id)?.name ?? 'Another manager';
  };

  /** True when this project is already attached to the person (as PM or lead). */
  const attachedToPerson = (
    project: (typeof portfolio.rows)[number],
    person: StaffRow,
  ) =>
    person.role === 'manager'
      ? project.managerId === person.id
      : project.leadId === (person.internId ?? person.id);

  const projectsForPerson = (person: StaffRow) =>
    portfolio.rows.filter((c) => attachedToPerson(c, person));

  function openAssign(person: StaffRow) {
    setAssignProjectId(null);
    setAssignTarget(person);
  }

  function closeAssign() {
    setAssignTarget(null);
    setAssignProjectId(null);
  }

  async function onAssignProject() {
    if (!assignTarget || !assignProjectId) return;
    const project = portfolio.rows.find((c) => c.id === assignProjectId);
    setAssigning(true);
    try {
      if (assignTarget.role === 'manager') {
        await updateEngagement(assignProjectId, { managerId: assignTarget.id });
      } else {
        await updateEngagement(assignProjectId, {
          internId: assignTarget.internId ?? assignTarget.id,
        });
      }
      toastSuccess(
        'Project assigned',
        `${project?.company ?? 'Project'} → ${assignTarget.name} (${ROLE_LABEL[assignTarget.role]})`,
      );
      closeAssign();
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  const reportingLines = reportingQuery.data ?? [];
  /** The admin a manager reports to, by the manager's profile id; null when not set. */
  const adminIdOfManager = (managerId: string): string | null =>
    reportingLines.find((l) => l.managerId === managerId)?.adminId ?? null;

  async function setManagerAdmin(manager: StaffRow, adminId: string | null) {
    setReportingSaving(manager.id);
    try {
      await fetchJson('/api/admin/people/reporting', {
        method: 'PATCH',
        body: JSON.stringify({ managerId: manager.id, adminId }),
      });
      const admin = adminId ? admins.find((a) => a.id === adminId) : null;
      toastSuccess(admin ? `${manager.name} reports to ${admin.name}` : `${manager.name} has no admin now`);
      await queryClient.invalidateQueries({ queryKey: ['admin-reporting-lines'] });
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setReportingSaving(null);
    }
  }

  const selectedManager = selectedManagerId
    ? managers.find((m) => m.id === selectedManagerId)
    : null;

  const managerLeads = selectedManagerId
    ? leads.filter((l) => l.reportsToManagerId === selectedManagerId)
    : [];
  const managerProjects = selectedManagerId
    ? portfolio.rows.filter((c) => c.managerId === selectedManagerId)
    : [];

  function openManager(id: string) {
    router.push(`${staffBase}/people?managerId=${id}`);
  }

  function openCreate(role: PersonRole) {
    dispatch({ type: 'patch', patch: { role, password: TEMP_PASSWORD } });
    setCreateOpen(true);
  }

  return {
    engagements,
    user,
    teamMembers,
    getStateForEngagement,
    updateEngagement,
    staffBase,
    router,
    searchParams,
    queryClient,
    createOpen,
    setCreateOpen,
    showPassword,
    setShowPassword,
    deletingId,
    setDeletingId,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    resetTarget,
    setResetTarget,
    confirmResetTwoStep,
    emailTarget,
    setEmailTarget,
    emailDraft,
    setEmailDraft,
    emailSaving,
    setEmailSaving,
    assignTarget,
    setAssignTarget,
    assignProjectId,
    setAssignProjectId,
    assigning,
    setAssigning,
    isAdmin,
    isSuperAdmin,
    isManager,
    canCreate,
    reportingQuery,
    reportingSaving,
    adminIdOfManager,
    setManagerAdmin,
    createRoles,
    selectedManagerId,
    peopleQuery,
    internsQuery,
    clientsQuery,
    removedClientsQuery,
    form,
    dispatch,
    onCreate,
    onDelete,
    openChangeEmail,
    closeChangeEmail,
    onChangeEmail,
    people,
    admins,
    developers,
    managers,
    leads,
    clients,
    removedClients,
    portfolio,
    leadName,
    managerName,
    attachedToPerson,
    projectsForPerson,
    openAssign,
    closeAssign,
    onAssignProject,
    selectedManager,
    managerLeads,
    managerProjects,
    openManager,
    openCreate,
  };
}

export type FirmPeopleState = ReturnType<typeof useFirmPeople>;
