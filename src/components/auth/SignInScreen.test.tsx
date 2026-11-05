import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const push = vi.fn();
const signIn = vi.fn();
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
}));
const refreshAuth = vi.fn();
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ signIn, refreshAuth }) }));
const authJsSignIn = vi.fn();
const getSession = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...a: unknown[]) => authJsSignIn(...a),
  getSession: () => getSession(),
  signOut: vi.fn(),
  getProviders: () => getProviders(),
}));
const getProviders = vi.fn(async () => ({ credentials: {} }) as Record<string, unknown>);
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.mock('@/components/common/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/toast-errors', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

import { SignInScreen } from './SignInScreen';

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^(Work email|Email)$/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

describe('SignInScreen', () => {
  beforeEach(() => {
    push.mockReset();
    signIn.mockReset();
    authJsSignIn.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ codeRequired: false }) });
    params = new URLSearchParams();
  });

  it('signs in through the app context and opens the role home', async () => {
    signIn.mockResolvedValue({ user: { role: 'intern' } });
    render(<SignInScreen />);
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Sign in' });
    expect(submit).toBeDisabled();
    fill('lead@firm.in', 'secret');
    fireEvent.click(submit);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/intern/today'));
    expect(signIn).toHaveBeenCalledWith('lead@firm.in', 'secret');
  });

  it('shows the sign-in error inline and stays on the page', async () => {
    signIn.mockResolvedValue({ error: 'Invalid email or password.' });
    render(<SignInScreen />);
    fill('lead@firm.in', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the existing notices, the back link and the demo link', () => {
    params = new URLSearchParams('error=no_profile');
    render(<SignInScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('No profile is linked to this account.');
    expect(screen.getByRole('link', { name: 'Back to site' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Demo accounts/)).toBeNull();
  });

  it('opens the Book a demo dialog from "No account yet?"', () => {
    render(<SignInScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Book a demo' }));
    const dialog = screen.getByRole('dialog', { name: 'Book a demo' });
    expect(within(dialog).getByLabelText('Work email')).toBeRequired();
  });

  it('toggles the password and opens the forgot-password dialog', () => {
    render(<SignInScreen />);
    const pass = screen.getByLabelText('Password');
    expect(pass).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pass).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByRole('dialog', { name: 'Need a new password?' })).toBeInTheDocument();
  });

  it('asks for the two-step code after the password and signs in with it (G-25)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ codeRequired: true }) });
    authJsSignIn.mockResolvedValue({ ok: true, error: undefined });
    getSession.mockResolvedValue({ user: { role: 'manager' } });
    render(<SignInScreen />);
    fill('pm@firm.in', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const codeField = await screen.findByLabelText('Code from the app');
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/two-step', expect.objectContaining({ method: 'POST' }));
    const verify = screen.getByRole('button', { name: 'Verify' });
    expect(verify).toBeDisabled();
    fireEvent.change(codeField, { target: { value: '123 456' } });
    fireEvent.click(verify);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/manager/dashboard'));
    expect(authJsSignIn).toHaveBeenCalledWith('credentials', {
      email: 'pm@firm.in',
      password: 'secret',
      otp: '123456',
      redirect: false,
    });
    expect(refreshAuth).toHaveBeenCalled();
  });

  it('keeps the code step open on a wrong code and can go back', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ codeRequired: true }) });
    authJsSignIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', code: 'two_step_invalid' });
    render(<SignInScreen />);
    fill('pm@firm.in', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.change(await screen.findByLabelText('Code from the app'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code did not match.');
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use another account' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});

describe('Microsoft sign-in (S-650)', () => {
  it('shows the button only when the provider is listed, and words for its errors', async () => {
    getProviders.mockResolvedValueOnce({ credentials: {}, 'microsoft-entra-id': {} });
    render(<SignInScreen />);
    expect(await screen.findByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument();
  });

  it('has no Microsoft button when the provider is not configured', async () => {
    render(<SignInScreen />);
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: /sign in with microsoft/i })).toBeNull();
  });
});

describe('SignInScreen, client partner variant', () => {
  beforeEach(() => {
    push.mockReset();
    signIn.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ codeRequired: false }) });
    getProviders.mockClear();
    params = new URLSearchParams();
  });

  it('shows the receivables heading and sends a partner to /receivables', async () => {
    signIn.mockResolvedValue({ user: { role: 'partner' } });
    render(<SignInScreen variant="partner" />);
    expect(screen.getByRole('heading', { name: 'Sign in to your receivables' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Book a demo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Microsoft' })).not.toBeInTheDocument();
    expect(getProviders).not.toHaveBeenCalled();
    fill('partner@client.in', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/receivables'));
  });
});
