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

  it('opens on Part B once Part B has begun, and marks what cannot be read from Suite as by hand', async () => {
    mount({
      status: 200,
      body: {
        ok: true,
        ...bundle({
          filings: [filing('spice-part-a'), filing('spice-part-b', { state: 'pdf_review', next: nextAction('pdf_review'), moves: movesFrom('spice-part-b', 'pdf_review') })],
          signers: [{ id: 'd1', name: 'Asha Rao', email: 'a@x.test', role: 'director', hasDsc: true, dscExpiry: '2027-01-01' }],
          missing: [{ key: 'k', label: 'Company mail ID', stepId: 'pre-1' }],
        }),
      },
    });
    expect(await screen.findByText('PDF review')).toBeTruthy();
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('Check by hand')).toBeTruthy();
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
});
