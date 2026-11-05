import type { Reach } from './types';
import { scrubText } from './mask';

/** Every outside call from the console gives up after this long. */
const DEV_CALL_TIMEOUT_MS = 5000;

/** The missing env var names, or an empty list when every one is set. */
export function missingEnv(names: string[], env: Record<string, string | undefined> = process.env): string[] {
  return names.filter((n) => !env[n]?.trim());
}

/** A short, safe line for a failed call: the error name and the first part of its message. */
export function reachError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
    return scrubText(`${name}${err.message}`).slice(0, 200);
  }
  return 'Unknown error';
}

/**
 * Run `fn` with a timeout and turn any failure into the "unreachable" state. `fn` gets an
 * AbortSignal it should pass to fetch or to an AWS SDK `send`.
 */
export async function reach<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs = DEV_CALL_TIMEOUT_MS): Promise<Reach<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const data = await Promise.race([
      fn(ctrl.signal),
      new Promise<never>((_, rej) => {
        ctrl.signal.addEventListener('abort', () => rej(new Error(`No answer in ${Math.round(timeoutMs / 1000)} s`)));
      }),
    ]);
    return { state: 'ok', data };
  } catch (err) {
    return { state: 'unreachable', error: reachError(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function notSetUp<T>(missing: string[]): Reach<T> {
  return { state: 'not_set_up', missing };
}
