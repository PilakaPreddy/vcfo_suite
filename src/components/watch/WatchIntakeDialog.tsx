'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { useWatchIntake } from '@/hooks/use-watch';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import type { WatchSourceStatus } from '@/lib/watch/types';

/** Paste a link or upload a PDF. MCA and Income Tax India notices arrive this way. */
export function WatchIntakeDialog({
  open,
  onOpenChange,
  sources,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: readonly WatchSourceStatus[];
}) {
  const intake = useWatchIntake();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const form = new FormData();
    if (file) form.set('file', file);
    else form.set('url', url);
    if (title.trim()) form.set('title', title);
    if (sourceId) form.set('sourceId', sourceId);
    intake.mutate(form, {
      onSuccess: () => {
        toastSuccess('Update added', 'It appears in the queue once it has been read.');
        setUrl('');
        setTitle('');
        setSourceId('');
        setFile(null);
        onOpenChange(false);
      },
      onError: (err) => toastError('Could not add it', err.message),
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add an update"
      footer={
        <Button type="submit" form="watch-intake" disabled={intake.isPending || (!file && !url.trim())}>
          {intake.isPending ? 'Adding' : 'Add update'}
        </Button>
      }
    >
      <form id="watch-intake" onSubmit={submit} className="grid gap-3.5">
        <div className="grid gap-1.5">
          <Label htmlFor="watch-url">Link on an official site</Label>
          <Input id="watch-url" type="url" inputMode="url" placeholder="https://" value={url} disabled={file != null} onChange={(event) => setUrl(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="watch-file">Or a PDF</Label>
          <input
            id="watch-file"
            type="file"
            accept="application/pdf,.pdf"
            className="text-[13px] text-ink-2 file:mr-2.5 file:h-control-sm file:rounded-md file:border-1.5 file:border-line-strong file:bg-surface-raised file:px-2.5 file:text-[13px] file:font-medium file:text-ink"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="watch-source">Source</Label>
          <FilterSelect
            id="watch-source"
            size="md"
            className="w-full [&>select]:w-full"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            options={[{ value: '', label: 'Other official source' }, ...sources.map((source) => ({ value: source.id, label: source.name }))]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="watch-title">Title (optional)</Label>
          <Input id="watch-title" maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
