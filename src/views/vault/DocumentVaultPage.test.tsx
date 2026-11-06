import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Engagement } from '@/data/engagements';
import type { DocNode } from '@/lib/client-portal/documents';

/**
 * Page-level checks for the staff Vault (K-39): Client view against Manage, picking a client,
 * the filter across clients, the Replaced toggle, folder collapse and the requested files.
 * `useApp`, navigation and `fetch` are stubbed; the page, its tree and its queries are real.
 */

const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/app/manager/vault',
}));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/shell/PageTransition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// The client's own Documents page has its own tests; here it only marks which mode is shown.
vi.mock('@/components/client-portal/pages/documents/StaffClientDocuments', () => ({
  StaffClientDocuments: ({ engagementId }: { engagementId: string }) => <p>Client documents of {engagementId}</p>,
}));
// Radix Select needs pointer events jsdom lacks, so a plain list of buttons stands in for it.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Pick = React.createContext<(v: string) => void>(() => undefined);
  return {
    Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: ReactNode }) => (
      <Pick.Provider value={onValueChange}>{children}</Pick.Provider>
    ),
    SelectTrigger: ({ children, ...rest }: { children: ReactNode; 'aria-label'?: string }) => (
      <span data-testid="client-select" aria-label={rest['aria-label']}>
        {children}
      </span>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const pick = React.useContext(Pick);
      return (
        <button type="button" role="option" aria-selected={false} onClick={() => pick(value)}>
          {children}
        </button>
      );
    },
  };
});

function engagement(id: string, name: string): Engagement {
  return {
    id,
    clientId: `c-${id}`,
    companyName: name,
    companyType: 'domestic',
    internId: 'lead-1',
    adminId: 'admin',
    createdAt: '2026-01-05',
    stage: 'Pre-Incorporation',
    health: 'on-track',
  } as Engagement;
}

const refreshEngagementChecklist = vi.fn(async () => undefined);
const appState = {
  user: { id: 'u-manager', role: 'manager', name: 'Mira Manager' },
  engagements: [engagement('acme', 'Acme Pvt Ltd'), engagement('birch', 'Birch LLP')],
  getStateForEngagement: () => ({}),
  engagementsLoading: false,
  refreshEngagementChecklist,
};
vi.mock('@/context/AppContext', () => ({ useApp: () => appState }));

function node(patch: Partial<DocNode> & { id: string; fileName: string }): DocNode {
  return {
    ref: `d:${patch.id}`,
    label: patch.fileName,
    status: 'In review',
    replaced: false,
    from: 'Acme',
    fromSbc: false,
    date: '2026-10-01T10:00:00.000Z',
    stepId: 'pre-1',
    categoryId: 'c1',
    source: 'index',
    indexRow: {
      id: patch.id,
      uploadedBy: 'u-client',
      reviewStatus: 'pending',
      reviewNote: null,
      reviewedAt: null,
      replacedAt: null,
    },
    ...patch,
  };
}

const payloads: Record<string, { companyName: string; nodes: DocNode[] }> = {
  acme: {
    companyName: 'Acme Pvt Ltd',
    nodes: [
      node({ id: 'doc-1', fileName: 'acme-pan.pdf' }),
      node({ id: 'doc-2', fileName: 'acme-pan-old.pdf', replaced: true }),
      node({ id: 'doc-3', fileName: 'acme-board-draft.docx', stepId: 'pre-2', categoryId: 'c3' }),
    ],
  },
  birch: {
    companyName: 'Birch LLP',
    nodes: [node({ id: 'doc-9', fileName: 'birch-pan.pdf', from: 'Birch' })],
  },
};

const indexRows = [
  { id: 'doc-1', engagementId: 'acme', category: 'documents', fileName: 'acme-pan.pdf', objectKey: 'k/1', stepId: 'pre-1', createdAt: '2026-10-01' },
  { id: 'doc-3', engagementId: 'acme', category: 'documents', fileName: 'acme-board-draft.docx', objectKey: 'k/3', stepId: 'pre-2', createdAt: '2026-10-01' },
  { id: 'doc-9', engagementId: 'birch', category: 'documents', fileName: 'birch-pan.pdf', objectKey: 'k/9', stepId: 'pre-1', createdAt: '2026-10-02' },
];

const requests: Record<string, unknown[]> = {
  acme: [{ id: 'r-1', title: 'Signed lease deed', detail: null, status: 'pending', dueOn: null, createdAt: '2026-10-03', files: [] }],
  birch: [],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname === '/api/documents') return json({ ok: true, documents: indexRows });
  if (url.pathname === '/api/client/documents') {
    const id = url.searchParams.get('engagement') ?? '';
    const p = payloads[id];
    return json({ documents: { engagementId: id, companyShort: p.companyName, openRequests: [], accept: { exts: [], maxLabel: '' }, ...p } });
  }
  if (url.pathname === '/api/documents/requests') {
    return json({ ok: true, requests: requests[url.searchParams.get('engagementId') ?? ''] ?? [] });
  }
  return json({ error: 'not_found' }, 404);
});

const { default: DocumentVaultPage } = await import('@/views/vault/DocumentVaultPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DocumentVaultPage />
    </QueryClientProvider>,
  );
}

const tree = () => screen.getByRole('tree', { name: 'Folders and files' });
const fileNames = () =>
  within(tree())
    .queryAllByRole('treeitem')
    .filter((row) => !row.hasAttribute('aria-expanded'))
    .map((row) => row.querySelector('span.block')?.textContent);

async function openManage() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Manage' }));
  await within(tree()).findByText('acme-pan.pdf');
}

beforeEach(() => {
  search = new URLSearchParams();
  push.mockReset();
  refreshEngagementChecklist.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('DocumentVaultPage', () => {
  it('opens on Client view for the first client and switches to Manage', async () => {
    renderPage();
    expect(await screen.findByText('Client documents of acme')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Client view' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tree')).toBeNull();
    expect(screen.queryByLabelText('Filter documents')).toBeNull();

    await openManage();
    expect(screen.queryByText('Client documents of acme')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Manage' })).toHaveAttribute('aria-selected', 'true');
    expect(localStorage.getItem('vcfo.vault-mode')).toBe('manage');
    expect(screen.queryByRole('link', { name: /Open project/ })).toBeNull();
  });

  it('remembers Manage from the last visit', async () => {
    localStorage.setItem('vcfo.vault-mode', 'manage');
    renderPage();
    expect(await within(tree()).findByText('acme-pan.pdf')).toBeInTheDocument();
  });

  it('lists the picked client’s files in step folders and previews the first one', async () => {
    renderPage();
    await openManage();
    expect(fileNames()).toEqual(['acme-pan.pdf', 'acme-board-draft.docx']);
    expect(within(tree()).getByRole('treeitem', { name: /Phase 1 · Name application/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('complementary', { name: 'Preview' })).getAllByText('acme-pan.pdf').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Filter documents').closest('label')).toHaveTextContent('2');

    fireEvent.click(within(tree()).getByText('acme-board-draft.docx'));
    expect(within(tree()).getByText('acme-board-draft.docx').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('shows another client’s files after picking it from the dropdown', async () => {
    renderPage();
    await openManage();
    fireEvent.click(screen.getByRole('option', { name: 'Birch LLP' }));
    expect(await within(tree()).findByText('birch-pan.pdf')).toBeInTheDocument();
    expect(fileNames()).toEqual(['birch-pan.pdf']);
    expect(screen.getByTestId('client-select')).toHaveTextContent('Birch LLP');
  });

  it('filters across every client and clears the filter', async () => {
    renderPage();
    await openManage();
    fireEvent.change(screen.getByLabelText('Filter documents'), { target: { value: 'pan' } });
    expect(refreshEngagementChecklist).toHaveBeenCalledWith('acme');
    expect(refreshEngagementChecklist).toHaveBeenCalledWith('birch');
    expect(await screen.findByText('2 files in 2 entities')).toBeInTheDocument();
    expect(fileNames()).toEqual(['acme-pan.pdf', 'birch-pan.pdf']);
    // The filter searches every client, so the client-only controls step aside.
    expect(screen.queryByRole('tablist', { name: 'Group documents' })).toBeNull();
    expect(screen.queryByText('Requested files')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter documents'), { target: { value: 'nothing-like-this' } });
    expect(await screen.findByText('No document matches “nothing-like-this”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await within(tree()).findByText('acme-board-draft.docx')).toBeInTheDocument();
  });

  it('reads ?q= from a link into the filter', async () => {
    search = new URLSearchParams('q=board');
    localStorage.setItem('vcfo.vault-mode', 'manage');
    renderPage();
    expect(await screen.findByText('1 file in 1 entity')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter documents')).toHaveValue('board');
  });

  it('shows replaced files only while the Replaced toggle is on', async () => {
    renderPage();
    await openManage();
    const toggle = screen.getByRole('button', { name: 'Replaced' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('title', '1 replaced');
    expect(within(tree()).queryByText('acme-pan-old.pdf')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const row = within(tree()).getByText('acme-pan-old.pdf').closest('[role="treeitem"]') as HTMLElement;
    expect(within(row).getByText('Replaced')).toBeInTheDocument();
  });

  it('turns the status glyphs off with the Status toggle', async () => {
    renderPage();
    await openManage();
    expect(within(tree()).getAllByRole('img').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(within(tree()).queryAllByRole('img')).toHaveLength(0);
  });

  it('collapses a folder and regroups by category', async () => {
    renderPage();
    await openManage();
    const step = within(tree()).getByRole('treeitem', { name: /Client Details/ });
    fireEvent.click(within(step).getAllByRole('button')[0]);
    expect(within(tree()).getByRole('treeitem', { name: /Client Details/ })).toHaveAttribute('aria-expanded', 'false');
    expect(fileNames()).toEqual(['acme-board-draft.docx']);

    fireEvent.click(screen.getByRole('tab', { name: 'By category' }));
    expect(within(tree()).getByRole('treeitem', { name: /Identity & KYC/ })).toBeInTheDocument();
    expect(within(tree()).getByRole('treeitem', { name: /Company records/ })).toBeInTheDocument();
  });

  it('lists the client’s requested files and counts them on Upload', async () => {
    renderPage();
    await openManage();
    expect(await screen.findByText('Signed lease deed')).toBeInTheDocument();
    expect(screen.getByText('Requested files')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Upload · 1 requested/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Birch LLP' }));
    expect(await screen.findByText('No files requested yet')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Upload$/ })).toBeInTheDocument());
  });

  it('ticks files for a ZIP of the selection and clears them', async () => {
    renderPage();
    await openManage();
    expect(screen.getByRole('button', { name: 'Download all (ZIP)' })).toBeEnabled();
    const boxes = within(tree()).getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(boxes[0]);
    });
    expect(screen.getByRole('button', { name: 'Download 1 selected (ZIP)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Download all (ZIP)' })).toBeInTheDocument();
  });
});
