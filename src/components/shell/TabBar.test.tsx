import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TabBar } from './TabBar';

const portal = vi.hoisted(() => ({ current: null as null | { openChat: () => void; setDrawerOpen: () => void; after: boolean } }));
const setOpen = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ usePathname: () => '/app/client/overview' }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ user: { role: portal.current ? 'client' : 'manager' } }) }));
vi.mock('@/components/ask/ask-context', () => ({ useAskOptional: () => ({ enabled: true, setOpen }) }));
vi.mock('@/components/client-portal/PortalProvider', () => ({ usePortalOptional: () => portal.current }));

describe('TabBar Ask tab', () => {
  beforeEach(() => setOpen.mockClear());

  it('opens the chat window in the client portal, which has no Ask panel', () => {
    portal.current = { openChat: vi.fn(), setDrawerOpen: vi.fn(), after: false };
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(portal.current.openChat).toHaveBeenCalledTimes(1);
    expect(setOpen).not.toHaveBeenCalled();
  });

  it('opens the Ask panel in the staff shell', () => {
    portal.current = null;
    render(<TabBar onMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(setOpen).toHaveBeenCalledWith(true);
  });
});
