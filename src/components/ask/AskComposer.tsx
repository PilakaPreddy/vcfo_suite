'use client';

import { useRef, useState } from 'react';
import { Paperclip, SendHorizontal, X } from 'lucide-react';
import { uploadAskAttachment } from '@/hooks/ask/ask-api';
import { ASK_VISIBILITY_NOTICE } from '@/lib/ask/question-gaps';
import { useAskOptional } from './ask-context';

const STAFF_MESSAGE_MAX = 20_000;
const CLIENT_MESSAGE_MAX = 2_000;
const MAX_FILES = 5;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.tsv,.txt';

/**
 * Input + Send: Send is the only solid main button in the panel (D1, R-12). Staff can also attach
 * files or paste a long block of details; the data router reads them and answers with a review card.
 */
export function AskComposer() {
  const ask = useAskOptional();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Array<{ id: string; fileName: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  if (!ask) return null;
  const client = ask.shell === 'client';
  const ready = (text.trim() || files.length > 0) && !ask.busy && !uploading;
  const submit = () => {
    if (!ready) return;
    const message = text.trim();
    const attachmentIds = files.map((file) => file.id);
    setText('');
    setFiles([]);
    setUploadError(null);
    void ask.ask({
      message: message || undefined,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      label: `Attached ${attachmentIds.length} file${attachmentIds.length === 1 ? '' : 's'}`,
    });
  };
  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0 || client) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of [...list].slice(0, MAX_FILES - files.length)) {
        const added = await uploadAskAttachment(file);
        setFiles((now) => [...now, added]);
      }
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  };
  return (
    <div className="space-y-1.5">
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-1">
          {files.map((file) => (
            <li key={file.id} className="flex max-w-full items-center gap-1 rounded-md border border-line bg-surface-sunken py-0.5 pl-2 pr-1 text-[12px] text-ink">
              <span className="truncate">{file.fileName}</span>
              <button type="button" aria-label={`Remove ${file.fileName}`} className="grid h-5 w-5 place-items-center rounded-mark hover:bg-surface-raised" onClick={() => setFiles((now) => now.filter((f) => f.id !== file.id))}>
                <X className="h-3 w-3" strokeWidth={1.6} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex items-end gap-2 rounded-md border-1.5 border-line-strong bg-surface-raised p-1 focus-within:border-brand focus-within:ring-4 focus-within:ring-focus-ring/25"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragOver={client ? undefined : (e) => e.preventDefault()}
        onDrop={
          client
            ? undefined
            : (e) => {
                e.preventDefault();
                void addFiles(e.dataTransfer.files);
              }
        }
      >
        {client ? null : (
          <>
            <input ref={picker} type="file" multiple accept={ACCEPT} className="sr-only" data-testid="ask-attach-input" aria-label="Attach a file" tabIndex={-1} onChange={(e) => void addFiles(e.target.files)} />
            <button
              type="button"
              aria-label="Attach a file"
              disabled={uploading || files.length >= MAX_FILES}
              onClick={() => picker.current?.click()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25 disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.6} />
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
              submit();
            }
          }}
          placeholder={client ? 'Ask about your company setup…' : 'Ask, paste details or attach a file…'}
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
      {uploading ? <p className="px-1 text-[12px] text-ink-muted">Attaching…</p> : null}
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
