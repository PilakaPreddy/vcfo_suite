import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PartnerHomeDto, PartnerInvoiceDetailDto, PartnerRowDto } from '@/lib/receivables/partner-wire';

/**
 * The signed-in client partner's page: the partner's own invoices in month blocks with the
 * totals tiles, a promised date and note count on the row, `?invoice=<id>` opening that invoice's
 * details (reminder emails link there), and the details' promise form posting to the partner
 * route. The routes are mocked with fetch.
 */

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), useSearchParams: () => search }));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('@/lib/toast-errors', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const { PartnerPage } = await import('./PartnerPage');

const MINE = '22222222-2222-2222-2222-222222222201';
const TODAY = '2026-11-03';

const row = (over: Partial<PartnerRowDto> = {}): PartnerRowDto => ({
  id: MINE,
  invoiceMonth: '2026-09-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03',
  partnerId: null,
  dueDate: '2026-10-16',
  amountInr: 6456984,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  partnerSlug: 'yash',
  partnerName: 'Yash Babbar',
  promisedOn: '2026-11-20',
  noteCount: 2,
  ...over,
});

const home = (over: Partial<PartnerHomeDto> = {}): PartnerHomeDto => ({
  partner: { name: 'Yash Babbar', email: 'yash@summit.example', notifyOnPublish: true },
  clientOrgName: 'Summit Consulting',
  publishedAt: '2026-11-02T10:00:00.000Z',
  today: TODAY,
  rows: [row(), row({ id: '22222222-2222-2222-2222-222222222209', clientName: 'Acme', invoiceNo: 'SC/10/01', dueDate: '2026-12-01', amountInr: 100000, promisedOn: null, noteCount: 0 })],
  ...over,
});

const detail: PartnerInvoiceDetailDto = {
  row: row({ promisedOn: null, noteCount: 1 }),
  reminders: [{ forDate: '2026-11-02', label: '17 days overdue', status: 'sent', sentAt: '2026-11-02T03:30:00.000Z' }],
  pause: null,
  notes: [{ id: 'n1', text: 'Client says Friday', authorName: 'Krishna Tungam', fromSbc: true, createdAt: '2026-11-02T05:00:00.000Z' }],
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const fetchMock = vi.fn();

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/receivables/partner/me') return json(home());
    if (url === `/api/receivables/partner/invoices/${MINE}`) return json(detail);
    if (url === `/api/receivables/partner/invoices/${MINE}/promise` && init?.method === 'POST') return json({ ok: true });
    return json({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PartnerPage', () => {
  it('lists the partner’s own invoices with the totals, the promise and the note count', async () => {
    render(wrap(<PartnerPage />));
    expect(await screen.findByRole('cell', { name: 'Duravant' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Acme' })).toBeTruthy();
    expect(screen.getByText('Open receivables')).toBeTruthy();
    // The table and the phone cards are both in the DOM; CSS shows one.
    expect(screen.getAllByText('Promised 20-Nov-26').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 notes').length).toBeGreaterThan(0);
    // Overdue first, under Needs attention; the rest under Coming up.
    expect(screen.getByRole('region', { name: 'Needs attention' }).textContent).toContain('Duravant');
    expect(screen.getByRole('region', { name: 'Coming up' }).textContent).toContain('Acme');
    for (const link of screen.getAllByRole('link', { name: 'Statement' })) expect(link.getAttribute('href')).toBe('/receivables/statement');
    expect(screen.getByRole('link', { name: 'Download Excel' }).getAttribute('href')).toBe('/api/receivables/partner/export');
    expect(screen.getByRole('link', { name: 'My account' }).getAttribute('href')).toBe('/receivables/account');
  });

  it('shows the USD amount under the INR of a foreign row and nothing extra on INR rows', async () => {
    fetchMock.mockImplementation(() => json(home({ rows: [row({ currency: 'USD', fcAmount: 12000, fxRate: 83.25, amountInr: 999000 }), row({ id: '22222222-2222-2222-2222-222222222209', clientName: 'Acme' })] })));
    render(wrap(<PartnerPage />));
    expect((await screen.findAllByText('USD 12,000.00')).length).toBe(2);
    // Once in the table and once on the phone card, and only for the USD row.
    expect(screen.getAllByText(/^USD /)).toHaveLength(2);
  });

  it('narrows the lists with the search box', async () => {
    render(wrap(<PartnerPage />));
    await screen.findByRole('cell', { name: 'Duravant' });
    fireEvent.change(screen.getByLabelText('Search invoices'), { target: { value: 'sc/10' } });
    expect(screen.queryByRole('cell', { name: 'Duravant' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Acme' })).toBeTruthy();
    expect(screen.getByText('No overdue invoices match your search.')).toBeTruthy();
  });

  it('shows what changed since the last visit from this browser', async () => {
    window.localStorage.setItem(
      'vcfo:rcv-partner-seen:yash@summit.example',
      JSON.stringify({ publishedAt: '2026-10-30T10:00:00.000Z', rows: [{ id: MINE, clientName: 'Duravant', invoiceNo: 'SC/09/03', amountInr: 6000000, status: 'open', dueDate: '2026-10-16' }] }),
    );
    render(wrap(<PartnerPage />));
    const box = await screen.findByRole('region', { name: 'What changed since your last visit' });
    expect(box.textContent).toContain('Amount changed');
    expect(box.textContent).toContain('New');
    // The visit is remembered, so the next one starts from this version.
    expect(JSON.parse(window.localStorage.getItem('vcfo:rcv-partner-seen:yash@summit.example')!).publishedAt).toBe('2026-11-02T10:00:00.000Z');
    window.localStorage.clear();
  });

  it('says nothing is published before the first Update', async () => {
    fetchMock.mockImplementation(() => json(home({ publishedAt: null, rows: [] })));
    render(wrap(<PartnerPage />));
    expect(await screen.findByText('Nothing is published yet.')).toBeTruthy();
  });

  it('opens the invoice named in ?invoice= with its reminders and notes', async () => {
    search = new URLSearchParams(`invoice=${MINE}`);
    render(wrap(<PartnerPage />));
    expect(await screen.findByText('17 days overdue')).toBeTruthy();
    expect(screen.getByText('Client says Friday')).toBeTruthy();
    // SBC's note carries the SBC owner chip inside the drawer.
    expect(within(screen.getByRole('dialog')).getByText('SBC')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(`/api/receivables/partner/invoices/${MINE}`, undefined);
  });

  it('saves a promise to pay through the partner route', async () => {
    search = new URLSearchParams(`invoice=${MINE}`);
    render(wrap(<PartnerPage />));
    const date = (await screen.findByLabelText('Promised by')) as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Save promise' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(date, { target: { value: '2026-11-02' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(date, { target: { value: '2026-11-20' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/promise'))).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/promise'))!;
    expect(JSON.parse(String(init.body))).toEqual({ promisedOn: '2026-11-20' });
  });
});
