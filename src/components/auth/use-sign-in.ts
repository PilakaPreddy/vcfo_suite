'use client';

import { useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, signIn as authJsSignIn, signOut as authJsSignOut } from 'next-auth/react';
import { useApp } from '@/context/AppContext';
import { isValidDbRole } from '@/lib/auth';
import { postLoginPath } from '@/lib/auth-routes';
import { toastError, toastSuccess } from '@/lib/toast-errors';

/**
 * State and actions for the sign-in page. It is the same flow as `src/views/auth/Login.tsx`:
 * Auth.js sign-in through `useApp().signIn`, the role home on success, and the error inline and as a toast.
 *
 * Two-step sign-in (G-25): before signing in, `POST /api/auth/two-step` says whether this email and
 * password need a code. It answers yes only for a right password on an account with two-step on, so it
 * never tells whether an email exists. When a code is needed the card asks for it, and the code goes to
 * Auth.js with the password as the `otp` field; `authorize` checks both.
 */
export type SignInStep = 'password' | 'code';

/** `?next=` of the login page; `postLoginPath` decides whether it is honoured. */
function nextParam(): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next');
}

export type SignInState = {
  step: SignInStep;
  email: string;
  password: string;
  code: string;
  showPassword: boolean;
  error: string | null;
  loading: boolean;
  forgotOpen: boolean;
  forgotEmail: string;
  forgotLoading: boolean;
};

type SignInAction = { type: 'patch'; patch: Partial<SignInState> } | { type: 'toggle_show_password' };

export const initialSignInState: SignInState = {
  step: 'password',
  email: '',
  password: '',
  code: '',
  showPassword: false,
  error: null,
  loading: false,
  forgotOpen: false,
  forgotEmail: '',
  forgotLoading: false,
};

export function signInReducer(state: SignInState, action: SignInAction): SignInState {
  switch (action.type) {
    case 'toggle_show_password':
      return { ...state, showPassword: !state.showPassword };
    case 'patch':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

const CODE_ERRORS: Record<string, string> = {
  two_step_invalid: 'That code did not match. Check your authenticator app and try again.',
  two_step_locked: 'Too many codes tried. Wait ten minutes and try again.',
  two_step_required: 'Enter the 6-digit code from your authenticator app.',
};

/** True when this email and password need a two-step code. Any failure answers false and the normal sign-in decides. */
async function needsCode(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/two-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { codeRequired?: boolean };
    return json.codeRequired === true;
  } catch {
    return false;
  }
}

export function useSignIn() {
  const { signIn, refreshAuth } = useApp();
  const router = useRouter();
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const patch = (p: Partial<SignInState>) => dispatch({ type: 'patch', patch: p });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.email || !state.password) return;
    patch({ error: null, loading: true });
    if (await needsCode(state.email, state.password)) {
      patch({ loading: false, step: 'code', code: '' });
      return;
    }
    const result = await signIn(state.email, state.password);
    patch({ loading: false });

    if (result.error) {
      patch({ error: result.error });
      toastError('Sign-in failed', result.error);
      return;
    }
    if (result.user) {
      router.push(postLoginPath(result.user.role, nextParam()));
    }
  };

  /** The code step: the same Auth.js Credentials sign-in, with the code as `otp`. */
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = state.code.replace(/[\s-]/g, '');
    if (!/^\d{6}$/.test(code)) {
      patch({ error: CODE_ERRORS.two_step_required });
      return;
    }
    patch({ error: null, loading: true });
    const result = await authJsSignIn('credentials', {
      email: state.email.trim().toLowerCase(),
      password: state.password,
      otp: code,
      redirect: false,
    });
    if (result?.error) {
      const message = CODE_ERRORS[result.code ?? ''] ?? "We couldn't sign you in. Check your email and password and try again.";
      patch({ loading: false, error: message, code: '' });
      toastError('Sign-in failed', message);
      // A wrong password at this step means the pre-check was stale; start again from the password.
      if (!result.code?.startsWith('two_step')) patch({ step: 'password' });
      return;
    }
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!role || !isValidDbRole(role)) {
      await authJsSignOut({ redirect: false });
      patch({ loading: false, error: 'No profile is linked to this account. Ask your firm admin to complete setup.' });
      return;
    }
    await refreshAuth();
    patch({ loading: false });
    router.push(postLoginPath(role, nextParam()));
  };

  const backToPassword = () => patch({ step: 'password', code: '', error: null });

  const submitForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    patch({ forgotLoading: true });
    await new Promise((r) => setTimeout(r, 200));
    patch({ forgotLoading: false, forgotOpen: false });
    toastSuccess(
      'Ask your firm manager',
      'Email password reset is not enabled yet. After they issue a temporary password, sign in and update it under Account settings.',
    );
  };

  return {
    state,
    submit,
    submitCode,
    backToPassword,
    setCode: (value: string) => patch({ code: value }),
    submitForgotPassword,
    setEmail: (value: string) => patch({ email: value }),
    setPassword: (value: string) => patch({ password: value }),
    toggleShowPassword: () => dispatch({ type: 'toggle_show_password' }),
    setForgotOpen: (open: boolean) => patch({ forgotOpen: open }),
    setForgotEmail: (value: string) => patch({ forgotEmail: value }),
    openForgot: () => patch({ forgotEmail: state.email, forgotOpen: true }),
  };
}
