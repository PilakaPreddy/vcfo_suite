import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Visual } from '@/data/ask/schema';

let role = 'client';
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1', role }, engagements: [{ id: 'eng-1', companyName: 'Acme' }] }),
}));
vi.mock('@/hooks/ask/use-ask-status', () => ({
  useAskStatus: (r: string) => ({ enabled: ['client', 'admin', 'super_admin', 'manager', 'intern'].includes(r), firmName: 'SBC' }),
}));
vi.mock('@/hooks/ask/use-ask-suggestions', () => ({
  useAskSuggestions: () => ({
    data: { suggestions: [{ id: 'client-gst', group: 'Learn the basics', label: 'What is GST, and do we need it?' }], snapshot: null },
    isError: false,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/client',
  useSearchParams: () => new URLSearchParams(),
}));

const { AskShellMount } = await import('@/components/ask/AskShellMount');
const { AskLauncher } = await import('@/components/ask/AskLauncher');
const { isAskShortcut } = await import('@/lib/ask/shortcut');
const { VisualRenderer } = await import('@/components/ask/visuals/VisualRenderer');
const { visualText } = await import('@/lib/ask/visual-text');

function wrap(children: ReactNode) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  role = 'client';
  window.sessionStorage.clear();
});

describe('VisualRenderer', () => {
  it('renders a valid flow with a screen-reader equivalent', () => {
    const visual: Visual = {
      type: 'flow',
      stages: [
        { label: 'Part A', state: 'done' },
        { label: 'Part B', state: 'here' },
      ],
    };
    const { container } = render(<VisualRenderer visual={visual} />);
    expect(container.querySelector('[data-visual="flow"]')).not.toBeNull();
    expect(screen.getByText('Stage 1 of 2, Part A, done. Stage 2 of 2, Part B, you are here.')).toBeInTheDocument();
    expect(visualText(visual)).toContain('you are here');
  });

  it('renders nothing for an unknown or malformed visual', () => {
    const { container } = render(<VisualRenderer visual={{ type: 'pie', slices: [1] }} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<VisualRenderer visual={{ type: 'flow', stages: [] }} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('gives key facts an sr-only text', () => {
    render(<VisualRenderer visual={{ type: 'keyFacts', facts: [{ k: 'When', v: 'Within 30 days' }, { k: 'Where', v: 'FIRMS' }] }} />);
    expect(screen.getByText('When: Within 30 days. Where: FIRMS.')).toHaveClass('sr-only');
  });
});

describe('role gating', () => {
  it.each(['developer'])('shows no launcher and no panel for %s', (r) => {
    role = r;
    render(wrap(<AskShellMount userRole={r}><AskLauncher /></AskShellMount>));
    expect(screen.queryByRole('button', { name: /ask vcfo/i })).toBeNull();
    expect(document.getElementById('ask-avatar')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Ask VCFO' })).toBeNull();
  });

  it.each(['client', 'admin', 'super_admin', 'manager', 'intern'])('shows the launcher for %s', (r) => {
    role = r;
    render(wrap(<AskShellMount userRole={r}><AskLauncher /></AskShellMount>));
    expect(screen.getByTitle('Ask VCFO (⌘J / Ctrl+J)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Ask VCFO chat' })).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('recognises ⌘J and Ctrl+J only', () => {
    const k = (over: Partial<KeyboardEvent>) =>
      isAskShortcut({ key: 'j', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });
    expect(k({ metaKey: true })).toBe(true);
    expect(k({ ctrlKey: true })).toBe(true);
    expect(k({ ctrlKey: true, key: 'J' })).toBe(true);
    expect(k({})).toBe(false);
    expect(k({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(k({ ctrlKey: true, key: 'k' })).toBe(false);
  });

  it('Ctrl+J opens the panel and Esc closes it', async () => {
    render(wrap(<AskShellMount userRole="client"><AskLauncher /></AskShellMount>));
    const launcher = screen.getByTitle('Ask VCFO (⌘J / Ctrl+J)');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('complementary', { name: 'Ask VCFO' })).toBeInTheDocument();
    expect(screen.getByText('What is GST, and do we need it?')).toBeInTheDocument();
    // A popup over the panel takes Escape first, so the same key press leaves the panel open.
    window.addEventListener('keydown', (e) => e.preventDefault(), { capture: true, once: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('pop-up size (owner item F3)', () => {
  beforeEach(() => window.localStorage.clear());

  it('switches between Small, Large and Side panel and keeps the choice per user', async () => {
    render(wrap(<AskShellMount userRole="admin"><AskLauncher /></AskShellMount>));
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    const panel = await screen.findByRole('complementary', { name: 'Ask VCFO' });
    expect(panel).toHaveAttribute('data-size', 'small');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Side panel' }));
    expect(panel).toHaveAttribute('data-size', 'side');
    expect(window.localStorage.getItem('vcfo.ask.size.u1')).toBe('side');
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(panel).toHaveAttribute('data-size', 'large');
    expect(screen.getByRole('button', { name: 'Open full page' })).toBeInTheDocument();
  });
});

describe('avatars (owner item F2)', () => {
  it('shows the initials beside a question and the robot beside an answer', async () => {
    const { AskUserBubble, AskAvatar } = await import('@/components/ask/AskUserBubble');
    const { container } = render(
      <>
        <AskUserBubble text="When is GST due?" initials="RK" />
        <AskAvatar />
      </>,
    );
    expect(screen.getByText('RK')).toBeInTheDocument();
    expect(container.querySelector('svg.vpv')).not.toBeNull();
  });
});

describe('robot launcher and sidebar link (owner decision 2 Nov 2026)', () => {
  it('opens the pop-up from the robot pill and closes it again', async () => {
    role = 'admin';
    render(wrap(<AskShellMount userRole="admin"><span /></AskShellMount>));
    const pill = screen.getByRole('button', { name: 'Open Ask VCFO chat' });
    expect(pill).toHaveAttribute('aria-controls', 'ask-panel');
    fireEvent.click(pill);
    expect(await screen.findByRole('complementary', { name: 'Ask VCFO' })).toBeInTheDocument();
    expect(document.getElementById('ask-avatar')).toHaveClass('open');
    fireEvent.click(screen.getByRole('button', { name: 'Close Ask VCFO chat' }));
    expect(document.getElementById('ask-avatar')).not.toHaveClass('open');
  });

  it('opens the pop-up when the robot itself is clicked', async () => {
    role = 'manager';
    render(wrap(<AskShellMount userRole="manager"><span /></AskShellMount>));
    fireEvent.click(document.querySelector('#ask-avatar .vpl-char')!);
    expect(await screen.findByRole('complementary', { name: 'Ask VCFO' })).toBeInTheDocument();
  });

  it('makes the sidebar Ask VCFO a link to the full page', () => {
    role = 'intern';
    render(wrap(<AskShellMount userRole="intern"><AskLauncher variant="sidebar" withShortcut={false} /></AskShellMount>));
    expect(screen.getByRole('link', { name: /Ask VCFO/ })).toHaveAttribute('href', '/app/intern/ask');
  });
});

describe('full page path (owner item F4)', () => {
  it('gives every Ask role its own page and the developer none', async () => {
    const { roleAskPath } = await import('@/lib/auth-routes');
    expect(roleAskPath('client')).toBe('/app/client/ask');
    expect(roleAskPath('intern')).toBe('/app/intern/ask');
    expect(roleAskPath('manager')).toBe('/app/manager/ask');
    expect(roleAskPath('admin')).toBe('/app/admin/ask');
    expect(roleAskPath('super_admin')).toBe('/app/super/ask');
    expect(roleAskPath('developer')).toBeNull();
  });
});

describe('full page (owner item F4)', () => {
  beforeEach(() => window.localStorage.clear());

  it('lists past chats of this scope and hides the pop-up', async () => {
    role = 'admin';
    window.localStorage.setItem(
      'vcfo.ask.history.u1',
      JSON.stringify([
        { id: 'c1', title: 'Which filings are late?', at: '2026-10-29T10:00:00.000Z', scope: 'vcfo.ask.conv.admin.firm' },
        { id: 'c2', title: 'Another firm scope', at: '2026-10-29T11:00:00.000Z', scope: 'vcfo.ask.conv.client.eng-1' },
      ]),
    );
    window.sessionStorage.setItem('vcfo.ask.open', '1');
    const { AskFullPage } = await import('@/components/ask/AskFullPage');
    render(wrap(<AskShellMount userRole="admin"><AskFullPage /></AskShellMount>));
    expect(await screen.findByRole('button', { name: /Which filings are late\?/ })).toBeInTheDocument();
    expect(screen.queryByText('Another firm scope')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Ask VCFO' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Past chats' })).toBeInTheDocument();
  });
});
