import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectDetail from '@/views/admin/ProjectDetail';

/**
 * The project record opened by URL. On a fresh page load the session is still hydrating, so
 * the engagements query is idle: not loading, with an empty list. The page must wait for the
 * query to settle before it decides the project does not exist.
 */

const app = vi.hoisted(() => ({ engagements: [] as unknown[], engagementsSettled: false }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'acme-pvt-ltd' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    ...app,
    engagementsLoading: false,
    getStateForEngagement: () => ({}),
    refreshEngagementChecklist: vi.fn(),
    teamMembers: [],
    user: null,
  }),
}));
vi.mock('@/hooks/use-staff-base-path', () => ({ useStaffBasePath: () => '/app/manager' }));
vi.mock('@/hooks/use-doc-pack', () => ({ useDocPack: () => ({ data: undefined }) }));
vi.mock('@/views/client-record/RecordTabs', () => ({ RecordTabBar: () => null, RecordTabPanel: () => null, useRecordTab: () => ['incorporation', vi.fn()] }));
vi.mock('@/components/common/HexgridLoader', () => ({ HexgridLoader: () => <span data-testid="loader" /> }));
vi.mock('@/components/routing/RedirectTo', () => ({ RedirectTo: ({ href }: { href: string }) => <span data-testid="redirect">{href}</span> }));

describe('ProjectDetail opened by URL', () => {
  it('shows the loader, not a redirect, while the engagements query has not settled', () => {
    app.engagementsSettled = false;
    render(<ProjectDetail />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('goes back to the list once the query settles without the project', () => {
    app.engagementsSettled = true;
    render(<ProjectDetail />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/app/manager/projects');
  });
});
