import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangesetGroupView, ChangesetRowView, ChangesetView } from '@/lib/ask/changeset/view-types';

const fetchChangeset = vi.fn();
const decideChangeset = vi.fn();
const editChangesetRow = vi.fn();
const undoChangeset = vi.fn();
vi.mock('@/hooks/ask/ask-api', () => ({
  fetchChangeset: (...a: unknown[]) => fetchChangeset(...a),
  decideChangeset: (...a: unknown[]) => decideChangeset(...a),
  editChangesetRow: (...a: unknown[]) => editChangesetRow(...a),
  undoChangeset: (...a: unknown[]) => undoChangeset(...a),
}));

const { AskChangesetCard } = await import('./AskChangesetCard');

function row(id: string, patch: Partial<ChangesetRowView> = {}): ChangesetRowView {
  return {
    id,
    stepId: 's1',
    stepTitle: 'Directors',
    label: `Field ${id}`,
    displayOld: '',
    displayNew: `Value ${id}`,
    sensitive: false,
    source: 'Your message',
    checks: [{ rule: 'format', ok: true }],
    status: 'proposed',
    heldReason: null,
    error: null,
    canDecide: true,
    canAccept: true,
    needsLook: false,
    editable: true,
    inputType: 'text',
    groupKey: 'values',
    groupTitle: 'Checklist values',
    groupKind: 'values',
    sourceFile: null,
    ...patch,
  };
}

function group(key: string, title: string, rows: ChangesetRowView[], counts = { ready: rows.length, held: 0, applied: 0 }): ChangesetGroupView {
  return { key, title, kind: rows[0]!.groupKind, rowIds: rows.map((r) => r.id), counts };
}

function card(rows: ChangesetRowView[], groups: ChangesetGroupView[], patch: Partial<ChangesetView> = {}): ChangesetView {
  return {
    id: 'cs-1',
    title: 'Acme: 3 files, 2 values',
    tier: 'T2',
    recipients: [],
    companyName: 'Acme',
    engagementId: 'e1',
    status: 'proposed',
    contentHash: 'hash-1',
    expiresAt: '2026-12-01T00:00:00.000Z',
    canUndo: false,
    rows,
    groups,
    ...patch,
  };
}

function show(view: ChangesetView) {
  fetchChangeset.mockResolvedValue(view);
  decideChangeset.mockResolvedValue(view);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AskChangesetCard changesetId={view.id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AskChangesetCard', () => {
  it('shows a small single-destination card as a plain list with Accept, Edit, Save and Discard', async () => {
    const rows = [row('a'), row('b')];
    show(card(rows, [group('values', 'Checklist values', rows)]));
    expect(await screen.findAllByTestId('changeset-row')).toHaveLength(2);
    expect(screen.queryByTestId('changeset-group')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save accepted (1)' }));
    await waitFor(() => expect(decideChangeset).toHaveBeenCalledWith('cs-1', { contentHash: 'hash-1', accept: ['a'] }));
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('names the T3 recipients', async () => {
    const rows = [row('a')];
    show(card(rows, [group('values', 'Checklist values', rows)], { tier: 'T3', recipients: [{ name: 'Asha', email: 'asha@acme.test' }] }));
    expect(await screen.findByTestId('changeset-recipients')).toHaveTextContent('Goes to Asha <asha@acme.test> once you accept.');
  });

  it('splits a mixed card into sections with counts and accepts the clear rows of one section only', async () => {
    const values = [row('v1'), row('v2', { needsLook: true })];
    const labour = [
      row('l1', { groupKey: 'labour:KA', groupTitle: 'Labour register · Karnataka · Aug 2026', groupKind: 'labour', label: 'pay.xlsx', sourceFile: 'pay.xlsx', editable: false }),
      row('l2', { groupKey: 'labour:KA', groupTitle: 'Labour register · Karnataka · Aug 2026', groupKind: 'labour', label: 'att.xlsx', sourceFile: 'att.xlsx', editable: false }),
      row('l3', { groupKey: 'labour:KA', groupTitle: 'Labour register · Karnataka · Aug 2026', groupKind: 'labour', label: 'ot.xlsx', sourceFile: 'ot.xlsx', editable: false, heldReason: 'Closed month', canAccept: false }),
    ];
    show(card([...values, ...labour], [group('values', 'Checklist values', values), group('labour:KA', 'Labour register · Karnataka · Aug 2026', labour, { ready: 2, held: 1, applied: 0 })]));
    const section = await screen.findByRole('region', { name: 'Labour register · Karnataka · Aug 2026' });
    expect(within(section).getByTestId('changeset-group-counts')).toHaveTextContent('2 ready1 held');
    expect(within(section).getAllByTestId('changeset-file')).toHaveLength(3);
    fireEvent.click(within(section).getByRole('button', { name: 'Accept all clear in Labour register · Karnataka · Aug 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save accepted (2)' }));
    await waitFor(() => expect(decideChangeset).toHaveBeenCalledWith('cs-1', { contentHash: 'hash-1', accept: ['l1', 'l2'] }));
  });

  it('accepts every clear row across sections from the footer, leaving rows that need a look', async () => {
    const values = [row('v1'), row('v2', { needsLook: true })];
    const vault = [row('d1', { groupKey: 'vault', groupTitle: 'Vault', groupKind: 'vault', editable: false })];
    show(card([...values, ...vault], [group('values', 'Checklist values', values), group('vault', 'Vault', vault)]));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept all clear rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save accepted (2)' }));
    await waitFor(() => expect(decideChangeset).toHaveBeenCalledWith('cs-1', { contentHash: 'hash-1', accept: ['v1', 'd1'] }));
  });

  it('folds every section of a card with more than 20 rows, and opens one on click', async () => {
    const values = Array.from({ length: 18 }, (_, i) => row(`v${i}`));
    const vault = Array.from({ length: 4 }, (_, i) => row(`d${i}`, { groupKey: 'vault', groupTitle: 'Vault', groupKind: 'vault', editable: false }));
    show(card([...values, ...vault], [group('values', 'Checklist values', values), group('vault', 'Vault', vault)]));
    const toggle = await screen.findByRole('button', { name: /^Vault/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByTestId('changeset-row')).toHaveLength(0);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('changeset-row')).toHaveLength(4);
    // A folded section can still be accepted from its header.
    fireEvent.click(screen.getByRole('button', { name: 'Accept all clear in Checklist values' }));
    expect(screen.getByRole('button', { name: 'Save accepted (18)' })).toBeEnabled();
  });

  it('offers Undo once rows are saved', async () => {
    const rows = [row('a', { status: 'applied', canAccept: false })];
    show(card(rows, [group('values', 'Checklist values', rows, { ready: 0, held: 0, applied: 1 })], { status: 'applied', canUndo: true }));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByText('Saved', { selector: 'span *, span' })).toBeInTheDocument();
  });
});
