'use client';

import { useId, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** True when the typed text matches the word, ignoring case and outer spaces. */
function dangerWordMatches(typed: string, word: string): boolean {
  return typed.trim().toUpperCase() === word.trim().toUpperCase();
}

export interface DangerConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question: "Remove Bharath from Northwind?" */
  title: string;
  /** What happens next, in one or two short sentences. */
  body?: ReactNode;
  /** The word to type, in capitals: "REMOVE". */
  word: string;
  /** Label of the red button: "Remove lead". */
  confirm: string;
  /** Runs when the word matches and the person confirms. A promise keeps the dialog open and the button busy until it settles. */
  onConfirm: () => void | Promise<void>;
  icon?: LucideIcon;
}

/**
 * M1 danger confirm (VCFO Spectrum B-14): a red tile, the question, what happens, and a field,
 * "Type REMOVE to confirm". The red button stays off until the word matches (any case). Enter
 * confirms; Escape and Cancel close. The body mounts with the dialog, so the field starts empty
 * every time it opens.
 */
export function DangerConfirm(props: DangerConfirmProps) {
  const id = useId();
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          role="alertdialog"
          aria-describedby={props.body ? `${id}-body` : undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border-1.5 border-line bg-surface-raised text-ink shadow-dialog outline-none"
        >
          <DangerConfirmBody {...props} id={id} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DangerConfirmBody({ onOpenChange, title, body, word, confirm, onConfirm, icon: Icon = Trash2, id }: DangerConfirmProps & { id: string }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = dangerWordMatches(typed, word);
  const wrong = typed.trim().length > 0 && !word.toUpperCase().startsWith(typed.trim().toUpperCase());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        try {
          await onConfirm();
          onOpenChange(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-3.5 px-[22px] pb-[18px] pt-[22px]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-danger-soft text-danger" aria-hidden>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <DialogPrimitive.Title className="text-[17px] font-medium leading-6">{title}</DialogPrimitive.Title>
            {body ? (
              <DialogPrimitive.Description id={`${id}-body`} className="text-[14px] leading-[21px] text-ink-2">
                {body}
              </DialogPrimitive.Description>
            ) : null}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-word`} className="text-[13px] font-medium text-ink-2">
            Type <span className="font-mono text-ink">{word}</span> to confirm
          </label>
          <Input
            id={`${id}-word`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: the field is the dialog's one control
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={wrong}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t-1.5 border-line bg-surface-sunken px-[22px] py-3.5">
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogPrimitive.Close>
        <Button type="submit" variant="destructive" disabled={!ok || busy} aria-busy={busy || undefined}>
          {confirm}
        </Button>
      </div>
    </form>
  );
}
