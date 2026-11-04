import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* The strength bar under a new password (prototype profile-settings PasswordForm). It only
   shows how strong the password is; the server's rule (8 or more characters) decides. */

const PASSWORD_CHECKS: Array<{ label: string; test: (v: string) => boolean }> = [
  { label: '8+ characters', test: (v) => v.length >= 8 },
  { label: 'Number', test: (v) => /\d/.test(v) },
  { label: 'Symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
  { label: 'Upper and lower case', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
];

const STRENGTH = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

/** How many of the four checks the password passes (0 to 4). */
function passwordScore(value: string): number {
  return PASSWORD_CHECKS.filter((c) => c.test(value)).length;
}

export function PasswordStrength({ value }: { value: string }) {
  const passed = passwordScore(value);
  const barTone =
    passed >= 4 ? 'bg-positive' : passed === 3 ? 'bg-positive-mid' : passed === 2 ? 'bg-warning-mid' : 'bg-danger-mid';
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1" role="img" aria-label={`Strength: ${STRENGTH[passed]}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-[5px] flex-1 rounded-sm', i < passed ? barTone : 'bg-line')} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {PASSWORD_CHECKS.map((c) => {
          const on = c.test(value);
          return (
            <span key={c.label} className={cn('inline-flex items-center gap-1', on ? 'text-positive' : 'text-ink-muted')}>
              {on ? (
                <Check className="h-[13px] w-[13px]" strokeWidth={1.6} aria-hidden />
              ) : (
                <X className="h-[13px] w-[13px]" strokeWidth={1.6} aria-hidden />
              )}
              {c.label}
            </span>
          );
        })}
        {value ? (
          <b className={cn('ml-auto font-medium', passed >= 3 ? 'text-positive' : 'text-warning')}>{STRENGTH[passed]}</b>
        ) : null}
      </div>
    </div>
  );
}
