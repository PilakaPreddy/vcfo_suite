'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * The firm's people and the manager-to-admin lines, for the super admin's assign dialogs, the
 * Admin column and the admins table (G-20). Reads `/api/admin/people` (the People roster, same
 * query key as the People page) and `/api/admin/people/reporting`.
 */

export interface SuperStaffRow {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'intern' | 'client' | 'developer';
  internId: string | null;
  reportsToManagerId: string | null;
  status?: string;
}

export interface ReportingLine {
  managerId: string;
  adminId: string | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const REPORTING_LINES_QUERY_KEY = ['admin-reporting-lines'] as const;

export function useSuperStaff() {
  const people = useQuery({
    queryKey: ['admin-people'],
    queryFn: async () => (await getJson<{ people: SuperStaffRow[] }>('/api/admin/people')).people,
    staleTime: 60_000,
  });
  const lines = useQuery({
    queryKey: REPORTING_LINES_QUERY_KEY,
    queryFn: async () => (await getJson<{ lines: ReportingLine[] }>('/api/admin/people/reporting')).lines,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const all = (people.data ?? []).filter((p) => p.status !== 'removed');
    const byId = new Map(all.map((p) => [p.id, p]));
    const managers = all.filter((p) => p.role === 'manager');
    const leads = all.filter((p) => p.role === 'intern' && p.internId);
    const firmAdmins = all.filter((p) => p.role === 'admin' || p.role === 'super_admin');
    const adminOfManager = new Map<string, SuperStaffRow>();
    for (const line of lines.data ?? []) {
      const admin = line.adminId ? byId.get(line.adminId) : undefined;
      if (admin) adminOfManager.set(line.managerId, admin);
    }
    return {
      isPending: people.isPending || lines.isPending,
      isError: people.isError || lines.isError,
      managers,
      leads,
      firmAdmins,
      adminOfManager,
      /** The admin over a manager, by the manager's profile id. */
      adminNameOf: (managerId: string | null | undefined) =>
        (managerId ? adminOfManager.get(managerId)?.name : undefined) ?? null,
    };
  }, [people.data, people.isPending, people.isError, lines.data, lines.isPending, lines.isError]);
}

export type SuperStaff = ReturnType<typeof useSuperStaff>;

/** Refresh every super read an assignment can change. */
export function useInvalidateSuperReads() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['super-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['super-project'] }),
      queryClient.invalidateQueries({ queryKey: ['super-insights'] }),
      queryClient.invalidateQueries({ queryKey: ['engagements'] }),
    ]);
  };
}
