import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Engagement } from '@/data/engagements';
import EngagementStepDetail from '@/views/engagement/EngagementStepDetail';

/**
 * Characterization tests for the shared checklist step page. They pin what the
 * lead, staff readers and the client see today, so the page can be reshaped
 * without changing the rendered tree. The child panels are stubs that print
 * the props they receive; the routing, gating and rail logic are real.
 */

const h = vi.hoisted(() => {
  const describeProps = (props: Record<string, unknown>) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(props)
          .filter(([key]) => key !== 'children')
          .map(([key, value]) => [
            key,
            typeof value === 'function'
              ? 'fn'
              : key === 'items' && Array.isArray(value)
                ? value.map((row: { item: { id: string } }) => row.item.id)
                : key === 'summary' || key === 'activity' || key === 'task' || key === 'item'
                  ? Boolean(value)
                  : value,
          ]),
      ),
    );
  const stub = (name: string) =>
    function Stub(props: Record<string, unknown>) {
      return (
        <span data-testid={name} data-props={describeProps(props)}>
          {props.children as React.ReactNode}
        </span>
      );
    };
  return {
    stub,
    push: vi.fn(),
    redirect: vi.fn(),
    nav: { pathname: '', params: {} as Record<string, string> },
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => h.nav.params,
  usePathname: () => h.nav.pathname,
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  redirect: (href: string) => h.redirect(href),
}));
vi.mock('@/components/SEO', () => ({ SEO: h.stub('SEO') }));
vi.mock('@/components/shell/PageTransition', () => ({ PageTransition: h.stub('PageTransition') }));
vi.mock('@/components/shell/PageBackButton', () => ({ PageBackButton: h.stub('PageBackButton') }));
vi.mock('@/components/common/HexgridLoader', () => ({ HexgridLoader: h.stub('HexgridLoader') }));
vi.mock('@/components/ask/WhatsThisButton', () => ({ WhatsThisButton: h.stub('WhatsThisButton') }));
vi.mock('@/components/incorporation/ClientFileRequestsPanel', () => ({
  ClientFileRequestsPanel: h.stub('ClientFileRequestsPanel'),
}));
vi.mock('@/components/client/ClientChangeRequestButton', () => ({
  ClientChangeRequestButton: h.stub('ClientChangeRequestButton'),
}));
vi.mock('@/components/client/ClientStepApproveButton', () => ({
  ClientStepApproveButton: h.stub('ClientStepApproveButton'),
}));
vi.mock('@/components/admin/StepDetailContent', () => ({ StepDetailContent: h.stub('StepDetailContent') }));
vi.mock('@/components/routing/RedirectTo', () => ({ RedirectTo: h.stub('RedirectTo') }));
vi.mock('@/views/client-record/StepAboutPanel', () => ({ StepAboutPanel: h.stub('StepAboutPanel') }));
vi.mock('@/views/engagement/step/StepWindowBar', () => ({ StepWindowBar: h.stub('StepWindowBar') }));
vi.mock('@/components/metrics/step-days-meta', () => ({ StepDaysMeta: h.stub('StepDaysMeta') }));
vi.mock('@/components/incorporation/ChecklistJourneyRail', () => ({
  ChecklistJourneyRail: h.stub('ChecklistJourneyRail'),
}));
vi.mock('@/components/doc-pack/DocPackHeaderButton', () => ({ DocPackHeaderButton: h.stub('DocPackHeaderButton') }));
vi.mock('@/components/doc-pack/DocPackRailCard', () => ({ DocPackRailCard: h.stub('DocPackRailCard') }));
vi.mock('@/components/doc-pack/DocSourceStrip', () => ({ DocSourceStrip: h.stub('DocSourceStrip') }));
vi.mock('@/components/assist-profile/CopyForAssist', () => ({ CopyForAssist: h.stub('CopyForAssist') }));
vi.mock('@/components/incorporation/ReopenStepButton', () => ({ ReopenStepButton: h.stub('ReopenStepButton') }));
vi.mock('@/lib/projects/engagements-db', () => ({ setEngagementWindowInDb: vi.fn() }));
vi.mock('@/hooks/use-doc-pack', () => ({
  useDocPack: (id: string | null) => ({
    data: id ? { engagementId: id } : undefined,
    isPending: false,
    isError: false,
  }),
}));

const engagement = {
  id: 'eng-1',
  slug: 'acme-pvt-ltd',
  clientId: 'client-1',
  clientUserId: 'user-client',
  companyName: 'Acme Pvt Ltd',
  companyType: 'domestic',
  ownershipType: 'independent',
  internId: 'user-intern',
} as unknown as Engagement;

type StateMap = Record<string, Record<string, unknown>>;

const app = {
  engagements: [engagement] as Engagement[],
  tasks: [] as unknown[],
  activity: [] as unknown[],
  updateTask: vi.fn(),
  getStateForEngagement: (() => ({})) as (e: Engagement) => StateMap,
  refreshEngagementChecklist: vi.fn(() => Promise.resolve()),
  engagementsLoading: false,
  engagementsSettled: true,
  user: { id: 'user-intern', role: 'intern' } as { id: string; role: string; clientId?: string } | null,
};
vi.mock('@/context/AppContext', () => ({ useApp: () => app }));

/** Renders the page and lets the checklist refresh settle, so the tree is the steady one. */
async function renderPage(pathname: string, params: Record<string, string>) {
  h.nav.pathname = pathname;
  h.nav.params = params;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <EngagementStepDetail />
    </QueryClientProvider>,
  );
  await act(async () => {});
  return view;
}

function propsOf(testId: string, index = 0): Record<string, unknown> {
  return JSON.parse(screen.getAllByTestId(testId)[index].getAttribute('data-props') ?? '{}');
}

beforeEach(() => {
  vi.clearAllMocks();
  app.engagements = [engagement];
  app.tasks = [];
  app.activity = [];
  app.getStateForEngagement = () => ({});
  app.engagementsLoading = false;
  app.engagementsSettled = true;
  app.user = { id: 'user-intern', role: 'intern' };
});

describe('EngagementStepDetail', () => {
  it('shows grey loading shapes until the engagement list has settled', async () => {
    app.engagements = [];
    app.engagementsSettled = false;
    await renderPage('/app/intern/engagements/acme-pvt-ltd/step/foo', { id: 'acme-pvt-ltd', stepId: 'pre-2' });
    expect(screen.getByLabelText('Loading the step')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('RedirectTo')).toBeNull();
  });

  it('sends a reader without the engagement back to their list', async () => {
    app.engagements = [];
    app.user = { id: 'user-manager', role: 'manager' };
    await renderPage('/app/manager/projects/missing/step/pre-2', { id: 'missing', stepId: 'pre-2' });
    expect(propsOf('RedirectTo').href).toBe('/app/manager/projects');
  });

  it('shows the No step card for an unknown step and opens the company from it', async () => {
    app.user = { id: 'user-manager', role: 'manager' };
    await renderPage('/app/manager/projects/acme-pvt-ltd/step/nope', { id: 'acme-pvt-ltd', stepId: 'nope' });
    expect(screen.getByText('No step')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Acme Pvt Ltd' }));
    expect(h.push).toHaveBeenCalledWith('/app/manager/projects/acme-pvt-ltd');
  });

  it('redirects a staff reader from the engagement id to its slug', async () => {
    app.user = { id: 'user-manager', role: 'manager' };
    await renderPage('/app/manager/projects/eng-1/step/pre-2', { id: 'eng-1', stepId: 'pre-2' });
    expect(h.redirect).toHaveBeenCalled();
    expect(h.redirect.mock.calls[0][0]).toMatch(/^\/app\/manager\/projects\/acme-pvt-ltd\/step\//);
  });

  it('gives the lead the editable workspace with the phase rail and the document pack', async () => {
    const { container } = await renderPage('/app/intern/engagements/acme-pvt-ltd/step/board-resolution-draft', {
      id: 'acme-pvt-ltd',
      stepId: 'board-resolution-draft',
    });
    const content = propsOf('StepDetailContent');
    expect(content).toMatchObject({
      engagementId: 'eng-1',
      viewer: 'staff',
      readOnly: false,
      hideWorkspaceRail: true,
      theme: 'light',
    });
    expect(screen.getAllByTestId('ChecklistJourneyRail').length).toBeGreaterThan(0);
    expect(screen.getByTestId('StepWindowBar')).toBeInTheDocument();
    expect(screen.getByTestId('ClientFileRequestsPanel')).toBeInTheDocument();
    expect(screen.getByTestId('StepAboutPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('PageBackButton')).toBeNull();
    expect(h.redirect).not.toHaveBeenCalled();
    expect(app.refreshEngagementChecklist).toHaveBeenCalledWith('eng-1');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('gives a manager the same layout read-only, waiting on the lead', async () => {
    app.user = { id: 'user-manager', role: 'manager' };
    const { container } = await renderPage('/app/manager/projects/acme-pvt-ltd/step/board-resolution-draft', {
      id: 'acme-pvt-ltd',
      stepId: 'board-resolution-draft',
    });
    expect(propsOf('StepDetailContent')).toMatchObject({ readOnly: true, viewer: 'staff' });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('opens another step from the rail', async () => {
    await renderPage('/app/intern/engagements/acme-pvt-ltd/step/board-resolution-draft', { id: 'acme-pvt-ltd', stepId: 'board-resolution-draft' });
    const rail = propsOf('ChecklistJourneyRail');
    expect(rail.selectedId).toBe('pre-2');
    expect(rail.onSelect).toBe('fn');
  });

  it('shows a direct-flow step with its last edit line and the reopen button once submitted', async () => {
    app.getStateForEngagement = () => ({
      'pre-1': {
        status: 'completed',
        submittedAt: '2026-10-12T10:35:00.000Z',
        lastEditedAt: '2026-10-12T10:35:00.000Z',
        lastEditedByName: 'Kiran Rao',
        lastEditedByRole: 'client',
      },
    });
    const { container } = await renderPage('/app/intern/engagements/acme-pvt-ltd/step/name-application', {
      id: 'acme-pvt-ltd',
      stepId: 'name-application',
    });
    expect(screen.getByText(/Last edited by Kiran Rao/)).toBeInTheDocument();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('gives the client the back button and the calm card before the step is released', async () => {
    app.user = { id: 'user-client', role: 'client' };
    const { container } = await renderPage('/app/client/incorporation/step/board-resolution-draft', { stepId: 'board-resolution-draft' });
    expect(screen.getByTestId('PageBackButton')).toBeInTheDocument();
    expect(propsOf('StepDetailContent')).toMatchObject({ viewer: 'client', readOnly: false });
    expect(screen.queryByTestId('StepWindowBar')).toBeNull();
    expect(screen.queryByTestId('ClientFileRequestsPanel')).toBeNull();
    expect(screen.queryByTestId('StepAboutPanel')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('gives the client Approve and Ask for a change once the step is released', async () => {
    app.user = { id: 'user-client', role: 'client' };
    app.getStateForEngagement = () => ({
      'pre-2': { status: 'in-progress', reviewStatus: 'accepted', deliveredToClientAt: '2026-10-12T10:35:00.000Z' },
    });
    const { container } = await renderPage('/app/client/incorporation/step/board-resolution-draft', { stepId: 'board-resolution-draft' });
    expect(screen.getByTestId('ClientStepApproveButton')).toBeInTheDocument();
    expect(screen.getByTestId('ClientChangeRequestButton')).toBeInTheDocument();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('shows a registration step without the document pack', async () => {
    app.user = { id: 'user-manager', role: 'manager' };
    const { container } = await renderPage('/app/manager/projects/acme-pvt-ltd/step/pf-dsc-esign-registration', {
      id: 'acme-pvt-ltd',
      stepId: 'pf-dsc-esign-registration',
    });
    expect(container.innerHTML).toMatchSnapshot();
  });
});
