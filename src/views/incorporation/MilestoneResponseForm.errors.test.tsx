import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { getItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';

/**
 * Missing-field display on the lead's tabbed step form:
 *  - before Submit, only a tab left with Next shows its errors (red dot);
 *  - a failed Submit marks every field (red border, aria-invalid,
 *    aria-describedby) and lists them in the summary;
 *  - a summary line opens the tab that holds the field.
 */

// jsdom has neither; the tab strip measures itself and the summary scrolls to a field.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const engagement = {
  id: 'eng-1',
  clientId: 'client-1',
  companyName: 'Acme India Private Limited',
  ownershipType: 'independent',
} as unknown as Engagement;

const useApp = vi.fn();
vi.mock('@/context/AppContext', () => ({ useApp: () => useApp() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/intern/engagements/acme/step/name-application',
}));
vi.mock('@/components/ask/FieldHelpButton', () => ({ FieldHelpButton: () => null }));
vi.mock('@/components/ask/WhatsThisButton', () => ({ WhatsThisButton: () => null }));
vi.mock('@/views/incorporation/milestone-form/field-review', () => ({ FieldReviewMark: () => null, FieldReviewControls: () => null }));

const { MilestoneResponseForm } = await import('@/views/incorporation/MilestoneResponseForm');

function renderForm() {
  const item = getItem('pre-1')!;
  return render(
    <LazyMotion features={domAnimation}>
      <MilestoneResponseForm
        item={item}
        clientId={engagement.clientId}
        engagementId={engagement.id}
        variant="admin"
        sectionTabs
        compactChrome
      />
    </LazyMotion>,
  );
}

beforeEach(() => {
  useApp.mockReturnValue({
    getState: () => ({}),
    getStateForEngagement: () => ({}),
    updateItem: vi.fn().mockResolvedValue(undefined),
    submitChecklistItem: vi.fn().mockResolvedValue(undefined),
    setUnlockedFields: vi.fn().mockResolvedValue(undefined),
    user: { id: 'lead-1', role: 'intern', name: 'Divya' },
    engagements: [engagement],
  });
});

function tabs() {
  return within(screen.getByRole('tablist')).getAllByRole('tab');
}

describe('missing-field display', () => {
  it('shows no errors before the user leaves a tab', () => {
    renderForm();
    expect(screen.queryByTestId('section-error-dot')).toBeNull();
    expect(screen.queryByText('This field is required.')).toBeNull();
  });

  it('marks a tab left with Next that still has an empty required field', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const first = tabs()[0]!;
    expect(within(first).getByTestId('section-error-dot')).toBeTruthy();
    expect(within(first).getByText('Needs attention')).toBeTruthy();
    // The tab the user moved to is untouched.
    expect(within(tabs()[1]!).queryByTestId('section-error-dot')).toBeNull();
  });

  it('marks every field after a failed Submit and links the summary to each one', async () => {
    renderForm();
    const all = tabs();
    fireEvent.click(all[all.length - 1]!);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });

    // Every tab with an empty required field is marked.
    expect(screen.getAllByTestId('section-error-dot').length).toBeGreaterThan(1);

    const summary = screen.getByRole('alert');
    const nicLine = within(summary).getByRole('button', { name: /Main NIC code/ });
    fireEvent.click(nicLine);

    const nicInput = await screen.findByLabelText(/Main NIC code/);
    expect(nicInput.getAttribute('aria-invalid')).toBe('true');
    expect(nicInput.className).toContain('border-danger');
    const describedBy = nicInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('This field is required.');
    // The tab that holds the field (NIC Codes, the last Part A tab) is the one now open.
    expect(tabs().at(-1)!.getAttribute('aria-selected')).toBe('true');
  });
});
