'use client';

import { useRef, useState } from 'react';
import { FolderUp, Paperclip, SendHorizontal, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { uploadAskFiles, type UploadProgress } from '@/hooks/ask/ask-api';
import { ASK_VISIBILITY_NOTICE } from '@/lib/ask/question-gaps';
import { DROP_MAX_FILES, formatUploadFileSize } from '@/lib/upload-limits';
import { cn } from '@/lib/utils';
import { useAskOptional } from './ask-context';
import { collectFromDataTransfer, collectFromFileList, DROP_ACCEPT, needsDrop, screenPicks, type Collected, type DropPick, type SkippedFile } from './drop/collect';
import { UploadList } from './drop/DropProgress';
import { SkippedList } from './drop/SkippedList';

const STAFF_MESSAGE_MAX = 20_000;
const CLIENT_MESSAGE_MAX = 2_000;

/** React does not type the folder picker attribute, so it is passed through as a plain prop. */
const FOLDER_PICKER = { webkitdirectory: '', directory: '' } as Record<string, string>;

/**
 * Input + Send: Send is the only solid main button in the panel (D1, R-12). Staff can also attach
 * files, drop whole folders or ZIPs, or paste a long block of details; the data router reads them and
 * answers with a review card.
 *
 * Files are held in the composer until Send. Up to five plain files go with the chat message as
 * before. A folder, a ZIP or more files become a drop: the files upload four at a time with
 * progress, and a background job sorts them while the thread shows its progress. Files that cannot
 * go (hidden files, .xls, too many, too large) are listed with the reason, never dropped silently.
 * Clients have no file drop.
 */
export function AskComposer() {
  const ask = useAskOptional();
  const [text, setText] = useState('');
  const [picks, setPicks] = useState<DropPick[]>([]);
  const [fromFolder, setFromFolder] = useState(false);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  if (!ask) return null;
  const client = ask.shell === 'client';
  const ready = (text.trim() || picks.length > 0) && !ask.busy && !sending;

  const addCollected = (collected: Collected) => {
    if (client) return;
    const screened = screenPicks(collected.picks, picks);
    setPicks((now) => [...now, ...screened.accepted]);
    if (collected.fromFolder && screened.accepted.length > 0) setFromFolder(true);
    setSkipped((now) => [...now, ...collected.skipped, ...screened.skipped]);
    setUploadError(null);
  };

  const fromInput = (input: HTMLInputElement | null) => {
    if (input?.files && input.files.length > 0) addCollected(collectFromFileList(input.files));
    if (input) input.value = '';
  };

  const sendSmall = async (message: string, files: DropPick[]) => {
    const result = await uploadAskFiles(files, { onProgress: setUploads });
    if (result.failed.length > 0) setSkipped((now) => [...now, ...result.failed]);
    const attachmentIds = result.uploaded.map((u) => u.id);
    if (!message && attachmentIds.length === 0) {
      setUploadError('None of these files could be attached.');
      return;
    }
    setUploads([]);
    await ask.ask({
      message: message || undefined,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      label: `Attached ${attachmentIds.length} file${attachmentIds.length === 1 ? '' : 's'}`,
    });
  };

  const submit = async () => {
    if (!ready) return;
    const message = text.trim();
    const files = picks;
    const asDrop = needsDrop(files, fromFolder);
    setText('');
    setPicks([]);
    setFromFolder(false);
    setSkipped([]);
    setUploadError(null);
    if (files.length === 0) {
      void ask.ask({ message });
      return;
    }
    setSending(true);
    try {
      if (asDrop) {
        const failed = await ask.sendDrop({ message: message || undefined, files, onProgress: setUploads });
        if (failed && failed.length > 0) setSkipped(failed);
      } else {
        await sendSmall(message, files);
      }
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setSending(false);
      setUploads([]);
    }
  };

  const totalBytes = picks.reduce((sum, p) => sum + p.file.size, 0);
  return (
    <div className="space-y-1.5">
      {picks.length > 0 && !sending ? (
        <div className="space-y-1 px-1">
          {picks.length > 3 ? (
            <p className="text-[12px] text-ink-muted">
              {picks.length} files, {formatUploadFileSize(totalBytes)}
              {needsDrop(picks, fromFolder) ? '. They will be sorted in the background.' : ''}
            </p>
          ) : null}
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {picks.map((pick) => (
              <li key={pick.path} className="flex max-w-full items-center gap-1 rounded-md border border-line bg-surface-sunken py-0.5 pl-2 pr-1 text-[12px] text-ink">
                <span className="truncate" title={pick.path}>
                  {pick.path}
                </span>
                <button type="button" aria-label={`Remove ${pick.path}`} className="grid h-5 w-5 flex-none place-items-center rounded-mark hover:bg-surface-raised" onClick={() => setPicks((now) => now.filter((p) => p.path !== pick.path))}>
                  <X className="h-3 w-3" strokeWidth={1.6} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sending ? <UploadList uploads={uploads} /> : null}
      {client ? null : <SkippedList skipped={skipped} onDismiss={() => setSkipped([])} className="mx-1" />}
      <form
        className={cn(
          'flex items-end gap-1 rounded-md border-1.5 border-line-strong bg-surface-raised p-1 focus-within:border-brand focus-within:ring-4 focus-within:ring-focus-ring/25',
          dragging && 'border-brand bg-brand-soft',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onDragOver={
          client
            ? undefined
            : (e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }
        }
        onDragLeave={client ? undefined : () => setDragging(false)}
        onDrop={
          client
            ? undefined
            : (e) => {
                e.preventDefault();
                setDragging(false);
                if (sending) return;
                // The entries are read inside the handler; the browser empties the list once it returns.
                void collectFromDataTransfer(e.dataTransfer).then(addCollected, (error: Error) => setUploadError(error.message));
              }
        }
      >
        {client ? null : (
          <>
            <input ref={picker} type="file" multiple accept={DROP_ACCEPT} className="sr-only" data-testid="ask-attach-input" aria-label="Attach a file" tabIndex={-1} onChange={(e) => fromInput(e.target)} />
            <input ref={folderPicker} type="file" multiple {...FOLDER_PICKER} className="sr-only" data-testid="ask-folder-input" aria-label="Attach a folder" tabIndex={-1} onChange={(e) => fromInput(e.target)} />
            <button
              type="button"
              aria-label="Attach a file"
              title="Attach files or a ZIP"
              disabled={sending || picks.length >= DROP_MAX_FILES}
              onClick={() => picker.current?.click()}
              className={cn(buttonVariants({ variant: 'quiet', size: 'iconSm' }), 'text-ink-muted')}
            >
              <Paperclip strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label="Attach a folder"
              title="Attach a whole folder"
              disabled={sending || picks.length >= DROP_MAX_FILES}
              onClick={() => folderPicker.current?.click()}
              className={cn(buttonVariants({ variant: 'quiet', size: 'iconSm' }), 'text-ink-muted')}
            >
              <FolderUp strokeWidth={1.6} />
            </button>
          </>
        )}
        <label htmlFor="ask-composer" className="sr-only">
          Ask VCFO
        </label>
        <textarea
          id="ask-composer"
          rows={1}
          value={text}
          maxLength={client ? CLIENT_MESSAGE_MAX : STAFF_MESSAGE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={client ? 'Ask about your company setup…' : 'Ask, paste details, or drop files or a folder…'}
          className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!ready}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-on-brand shadow-shine hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25 disabled:opacity-50"
        >
          <SendHorizontal className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </form>
      {uploadError ? (
        <p role="alert" className="px-1 text-[12px] text-danger">
          {uploadError}
        </p>
      ) : null}
      {/* The client lines are disclosures (who can see the chat, no legal advice), so they stay;
          the staff helper line went with R-06. */}
      {client && ask.features.A1 && <p className="px-1 text-[12px] text-ink-muted">{ASK_VISIBILITY_NOTICE}</p>}
      {client ? (
        <p className="px-1 text-[12px] text-ink-muted">
          Ask VCFO explains; it doesn&apos;t give legal advice. Your project lead confirms decisions.
        </p>
      ) : null}
    </div>
  );
}
