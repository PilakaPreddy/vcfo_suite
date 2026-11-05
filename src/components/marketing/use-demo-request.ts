'use client';

import { useState } from 'react';

/**
 * Posts one "Book a demo" request to `/api/public/demo-request` (G-30). The route stores it in
 * `demo_requests` (the super admin Growth screen reads it) and emails the firm. The Book a demo
 * dialog and the /contact form share this hook, so both send the same body and show the same
 * error words. `website` is the honeypot: hidden from people, filled by bots.
 */
const DEMO_REQUEST_URL = '/api/public/demo-request';

export interface DemoRequestBody {
  name: string;
  email: string;
  company: string;
  message?: string;
  website: string;
}

export type DemoRequestState = 'idle' | 'sending' | 'sent';

const FAILED = 'Could not send the request. Try again.';

export function useDemoRequest() {
  const [state, setState] = useState<DemoRequestState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send(body: DemoRequestBody): Promise<boolean> {
    setState('sending');
    setError(null);
    try {
      const res = await fetch(DEMO_REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || FAILED);
      }
      setState('sent');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : FAILED);
      setState('idle');
      return false;
    }
  }

  function reset() {
    setState('idle');
    setError(null);
  }

  return { state, error, send, reset };
}
