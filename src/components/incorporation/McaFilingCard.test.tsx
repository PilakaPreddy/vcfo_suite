import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { McaFilingCard } from './McaFilingCard';
import { nextAction, movesFrom, type FilingForm } from '@/lib/mca-filing/filing-state';
import type { FilingBundle, FilingDto } from '@/lib/mca-filing/types';

function filing(form: FilingForm, over: Partial<FilingDto> = {}): FilingDto {
  return {
    form,
    state: 'data_ready',
    srn: null,
    srnAt: null,
    nameApprovedAt: null,
    signedUploadedAt: null,
    paidAt: null,
    lastRemark: null,
    remarks: [],
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    signatureRequests: [],
    next: nextAction('data_ready'),
    deadlines: [],
    moves: movesFrom(form, 'data_ready'),
    ...over,
  };
}

const bundle = (over: Partial<FilingBundle> = {}): FilingBundle => ({
  engagementId: 'eng-1',
  companyName: 'Acme',
  filings: [filing('spice-part-a'), filing('spice-part-b')],
  documents: [],
  missing: [],
  signers: [],
  signerChecks: [],
  packet: { latest: null, changed: [], currentHash: 'h' },
  causes: [],
  readiness: {
    'spice-part-a': { ready: true, blockers: [], warnings: [], checks: [] },
    'spice-part-b': { ready: true, blockers: [], warnings: [], checks: [] },
  },
  ...over,
});

function mount(filingResponse: { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).endsWith('/attachments') ? { ok: true, items: [] } : filingResponse.body;
      return new Response(JSON.stringify(body), { status: String(url).endsWith('/attachments') ? 200 : filingResponse.status });
    }),
  );
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <McaFilingCard engagementId="eng-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe('McaFilingCard', () => {
  it('stays away while VCFO Assist is off', async () => {
    const { container } = mount({ status: 503, body: { ok: false, error: 'assist_not_set_up' } });
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('shows the notice, the state and the next action', async () => {
    mount({ status: 200, body: { ok: true, ...bundle() } });
    expect(await screen.findByText('Software filling on the live MCA portal needs written CS approval first.')).toBeTruthy();
    expect(screen.getByText('Data ready')).toBeTruthy();
    expect(screen.getByText(/Project lead: Clear the missing values/)).toBeTruthy();
  });

  it('opens on Part B once Part B has begun, and shows what each signer still lacks', async () => {
    mount({
      status: 200,
      body: {
        ok: true,
        ...bundle({
          filings: [filing('spice-part-a'), filing('spice-part-b', { state: 'pdf_review', next: nextAction('pdf_review'), moves: movesFrom('spice-part-b', 'pdf_review') })],
          signers: [{ id: 'd1', name: 'Asha Rao', email: 'a@x.test', role: 'director', hasDsc: true, dscExpiry: '2027-01-01' }],
          signerChecks: [
            {
              signerId: 'd1',
              name: 'Asha Rao',
              ready: false,
              portal: { businessUserOn: null, dscAssociatedOn: null },
              items: [
                { key: 'email', ok: true, text: 'Email on record.' },
                { key: 'business_user', ok: false, text: 'Business User registration not confirmed.' },
              ],
            },
          ],
          missing: [{ key: 'k', label: 'Company mail ID', stepId: 'pre-1' }],
        }),
      },
    });
    expect(await screen.findByText('PDF review')).toBeTruthy();
    expect(screen.getAllByText('Asha Rao').length).toBeGreaterThan(0);
    expect(screen.getByText('Business User registration not confirmed.')).toBeTruthy();
    expect(screen.getByLabelText('Business User since')).toBeTruthy();
    expect(screen.getByText('Company mail ID')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email the PDF to signers' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Add the portal PDF first.')).toBeTruthy();
  });

  it('says plainly when a portal PDF cannot be read, and asks for a note', async () => {
    mount({
      status: 200,
      body: {
        ok: true,
        ...bundle({
          filings: [filing('spice-part-a'), filing('spice-part-b', { state: 'pdf_review', next: nextAction('pdf_review') })],
          documents: [
            {
              id: 'p1',
              form: 'spice-part-b',
              kind: 'portal_pdf',
              fileName: 'form.pdf',
              size: 10,
              sha256: 's',
              textHash: null,
              signers: [],
              check: { checked: 0, found: 0, missing: [], unreadable: true, pages: 1, readerError: null },
              stale: false,
              uploadedBy: 'Asha',
              createdAt: '2026-11-05T06:00:00Z',
            },
          ],
        }),
      },
    });
    expect(await screen.findByText(/cannot be read, so nothing was compared/)).toBeTruthy();
    expect(screen.getByLabelText('Approval note')).toBeTruthy();
  });

  it('shows the verdict, the repeat causes and a packet changed since the freeze', async () => {
    mount({
      status: 200,
      body: {
        ok: true,
        ...bundle({
          packet: { latest: { version: 2, hash: 'x', note: null, createdBy: 'Asha', createdAt: '2026-11-08T06:00:00Z' }, changed: ['signers'], currentHash: 'y' },
          readiness: {
            'spice-part-a': {
              ready: false,
              blockers: [{ group: 'values', text: '1 value is blank in Suite.' }],
              warnings: [],
              checks: [{ cause: 'office_proof', label: 'Registered office proof', check: 'Check the utility bill is recent.', count: 3 }],
            },
            'spice-part-b': { ready: true, blockers: [], warnings: [], checks: [] },
          },
        }),
      },
    });
    expect(await screen.findByText('1 to fix')).toBeTruthy();
    expect(screen.getByText('1 value is blank in Suite.')).toBeTruthy();
    expect(screen.getByText(/Check the utility bill is recent/)).toBeTruthy();
    expect(screen.getByText('Changed since packet 2: signers.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download packet 2' }).getAttribute('href')).toBe('/api/assist/engagements/eng-1/filing/packets/2');
    expect(screen.getByRole('button', { name: 'Freeze a new packet' })).toHaveProperty('disabled', false);
  });
});
