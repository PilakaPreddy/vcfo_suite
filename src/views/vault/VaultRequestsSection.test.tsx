import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RequestDialog } from './VaultRequestsSection';
import { COMPOSE_OUTGOING_EMAIL_EVENT } from '@/lib/toast-errors';

describe('Vault "Request a file" (UAT D-T06-01)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the email to the client that the route drafts, so the client hears about the request', async () => {
    const draft = { to: ['kiran.rao@uat-client.test'], subject: 'Nilgiri: please upload PAN — Kiran Rao', html: '<p>x</p>', text: 'x' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ request: { id: 'r1' }, email: { attempted: 0, sent: [], skipped: [], failed: [], subjects: [], outgoingDraft: draft } }), { status: 201 }),
    );
    const composed: unknown[] = [];
    const onCompose = (e: Event) => composed.push((e as CustomEvent).detail);
    window.addEventListener(COMPOSE_OUTGOING_EMAIL_EVENT, onCompose);
    const onCreated = vi.fn();
    render(<RequestDialog open onOpenChange={() => {}} engagementId="e1" companyName="Nilgiri" onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('File needed'), { target: { value: 'PAN — Kiran Rao' } });
    fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    window.removeEventListener(COMPOSE_OUTGOING_EMAIL_EVENT, onCompose);
    expect(composed).toEqual([draft]);
  });
});
