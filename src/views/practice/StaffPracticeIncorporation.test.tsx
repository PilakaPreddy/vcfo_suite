import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { summarizeEngagement, type SuperEngagementSummary } from '@/lib/super/super-overview';
import type { PracticeIncorporationClient } from '@/lib/practice/practice-incorporation';

/**
 * Flow test for the staff Incorporation page (R-51, D-29), against mocked fetches. The page
 * reads only the scoped `/api/practice/incorporation` (and the scoped practice metrics), never
 * the super-only insights; it shows the four tiles, filters by who holds the step, marks late
 * rows, opens a row in the caller's shell, and shows "No clients in incorporation" with
 * "View clients" when nothing is incorporating.
 */

vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/shell/PageTransition', () => ({ PageTransition: ({ children }: { children: ReactNode }) => <>{children}</> }));

const { default: StaffPracticeIncorporation } = await import('@/views/practice/StaffPracticeIncorporation');

function client(
  id: string,
  name: string,
  patch: Partial<SuperEngagementSummary> = {},
  rest: Partial<PracticeIncorporationClient> = {},
): PracticeIncorporationClient {
  const base = summarizeEngagement({
    id,
    slug: id,
    companyName: name,
    clientName: null,
    stage: 'Pre-Incorporation',
    health: 'on-track',
    leadId: null,
    leadName: null,
    managerId: null,
    managerName: null,
    incorporationDate: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    state: {},
  });
  return {
    summary: { ...base, href: `/app/manager/projects/${id}`, ...patch },
    startedPreInc: true,
    certificateDate: null,
    daysToCoi: null,
    nextDueDate: null,
    ...rest,
  };
}

let calls: string[] = [];
let incorporation: { status: number; body: unknown };
const push = vi.fn();

beforeEach(() => {
  calls = [];
  push.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      calls.push(input);
      const path = input.split('?')[0];
      const res =
        path === '/api/practice/incorporation'
          ? incorporation
          : path === '/api/metrics/practice'
            ? { status: 200, body: { practice: { currentStep: { kestrel: { stepId: 'pre-1', title: 'x', days: 9, dueOn: '2020-01-01' } } } } }
            : { status: 404, body: { error: 'not_found' } };
      return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
  return render(
    <AppRouterContext.Provider value={router as never}>
      <QueryClientProvider client={qc}>
        <StaffPracticeIncorporation base="/app/manager" />
      </QueryClientProvider>
    </AppRouterContext.Provider>,
  );
}

describe('staff Incorporation page (R-51)', () => {
  it('lists the scoped clients still incorporating, filters by who holds the step and opens a row', async () => {
    const kestrel = client('kestrel', 'Kestrel Labs Private Limited', {
      stateKey: 'with-firm',
      currentStep: { id: 'pre-1', title: 'Name search', owner: 'firm' },
    });
    const solstice = client('solstice', 'Solstice Foods Private Limited', {
      stateKey: 'with-client',
      currentStep: { id: 'pre-2', title: 'Client documents', owner: 'client' },
    });
    const done = client('aurora', 'Aurora Mills Private Limited', { incorporated: true });
    incorporation = { status: 200, body: { clients: [kestrel, solstice, done] } };

    renderPage();
    await screen.findByText('Kestrel Labs');

    // Only scoped reads; the super-only insights are never asked for.
    expect(calls.some((u) => u.startsWith('/api/practice/incorporation'))).toBe(true);
    expect(calls.some((u) => u.startsWith('/api/super'))).toBe(false);

    // The four tiles.
    for (const label of ['Clients incorporating', 'Waiting on client', 'With manager', 'Stuck or overdue']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The incorporated client is not listed.
    expect(screen.queryByText('Aurora Mills')).toBeNull();
    expect(screen.getByText('Solstice Foods')).toBeTruthy();
    // Step code and name, steps n / total.
    // The step number as the project page shows it, not the internal id "pre-2".
    expect(screen.getByText('Step 2')).toBeTruthy();
    expect(screen.getByText('Client documents')).toBeTruthy();

    // The late row (its step window has passed) is red.
    await waitFor(() => {
      const late = screen.getByText('Kestrel Labs').closest('tr');
      expect(late?.className).toContain('text-danger');
    });
    expect(screen.getByText('Solstice Foods').closest('tr')?.className ?? '').not.toContain('text-danger');

    // With filter: Client keeps only Solstice.
    const tabs = screen.getByRole('tablist', { name: 'With' });
    fireEvent.click(within(tabs).getByRole('tab', { name: /Client/ }));
    expect(screen.queryByText('Kestrel Labs')).toBeNull();
    expect(screen.getByText('Solstice Foods')).toBeTruthy();

    // A row opens the client record in this shell.
    fireEvent.click(screen.getByText('Solstice Foods'));
    expect(push).toHaveBeenCalledWith('/app/manager/projects/solstice');
  });

  it('shows "No clients in incorporation" with one "View clients" button', async () => {
    incorporation = { status: 200, body: { clients: [client('aurora', 'Aurora Mills Private Limited', { incorporated: true })] } };
    renderPage();
    expect(await screen.findByText('No clients in incorporation')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View clients' });
    expect(link.getAttribute('href')).toBe('/app/manager/projects');
  });

  it('shows the error with a retry when the scoped read fails', async () => {
    incorporation = { status: 403, body: { error: 'Forbidden' } };
    renderPage();
    expect(await screen.findByText('Incorporation could not load')).toBeTruthy();
  });
});
