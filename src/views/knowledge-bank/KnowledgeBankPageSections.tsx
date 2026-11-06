"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileBadge, fileType } from '@/components/ui/file-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DashSection } from '@/components/dash/DashSection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import type {
  KnowledgeBankDeleteTarget,
  KnowledgeBankFile,
  KnowledgeBankFolder,
} from '@/views/knowledge-bank/knowledge-bank-ui-state';
import { cn } from '@/lib/utils';
import { ChevronRight, Download, Loader2, Search, Trash2, Upload } from 'lucide-react';

/* VCFO Spectrum knowledge bank (prototype src/screens/shared/KnowledgeBankScreen.tsx, rows
   C-0107 and C-0110). A plain toolbar (folder path, search, New folder, Upload document), the
   folders drawn as shelves, the open folder's documents as clean rows with file badges, and the
   "Upload to library" form in a side card. Every upload, folder, download and delete call is
   the page's own; this file only draws them. */

/** Plain date (R-29): "14 Oct", with the year only when it is not this year. */
function plainDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/* Spine colours come from the status and regulator tokens (R-25: no off-system colours). */
const SPINES = [
  'bg-identity-mid',
  'bg-brand',
  'bg-reg-mca',
  'bg-positive-mid',
  'bg-reg-it',
  'bg-warning-mid',
  'bg-danger-mid',
  'bg-waiting-mid',
];

/** A stable small number from the folder id, so each shelf keeps its own spine pattern. */
function seedOf(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) % 997;
  return n;
}

const ICON_BTN = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-[30px] w-[30px] min-w-0 text-ink-2');

function FolderShelf({
  folder,
  count,
  canDelete,
  empty,
  onOpen,
  onDelete,
}: {
  folder: KnowledgeBankFolder;
  /** Documents filed directly in this folder. */
  count: number;
  canDelete: boolean;
  empty: boolean;
  onOpen: (id: string) => void;
  onDelete: (folder: KnowledgeBankFolder) => void;
}) {
  const seed = seedOf(folder.id);
  const books = Array.from({ length: Math.min(count, 9) }, (_, i) => ({
    w: 14 + ((i * 7 + seed) % 3) * 4,
    h: 70 + ((i * 13 + seed) % 5) * 9,
    tone: SPINES[(i + seed) % SPINES.length],
  }));
  return (
    <div className="group min-w-0">
      <button
        type="button"
        onClick={() => onOpen(folder.id)}
        className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
        aria-label={`Open ${folder.name}`}
      >
        <span className="flex h-[112px] items-end gap-1.5 overflow-hidden px-3.5" aria-hidden>
          {books.map((b, i) => (
            <span key={i} className={cn('block flex-none rounded-t-bar', b.tone)} style={{ width: b.w, height: b.h }} />
          ))}
        </span>
        <span className="block h-1.5 rounded-bar bg-line-strong" aria-hidden />
      </button>
      <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => onOpen(folder.id)}
          className="min-w-0 truncate text-left text-[14px] font-medium text-ink hover:underline"
        >
          {folder.name}
        </button>
        <span className="flex flex-none items-center gap-1.5">
          <span className="text-[12.5px] tabular-nums text-ink-muted">
            {count} {count === 1 ? 'doc' : 'docs'}
          </span>
          {canDelete && empty ? (
            <button
              type="button"
              onClick={() => onDelete(folder)}
              className="grid h-6 w-6 place-items-center rounded-mark text-ink-muted opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Delete ${folder.name}`}
              title="Delete folder"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function DocumentRow({
  file,
  canDelete,
  downloadingId,
  showFolderPath,
  readerHref,
  onDownload,
  onDelete,
}: {
  file: KnowledgeBankFile;
  /** The staff reader for this file (`<knowledge bank>/<id>`). */
  readerHref: string;
  canDelete: boolean;
  downloadingId: string | null;
  showFolderPath: boolean;
  onDownload: (file: KnowledgeBankFile) => void;
  onDelete: (file: KnowledgeBankFile) => void;
}) {
  const isDownloading = downloadingId === file.id;
  const second = [
    showFolderPath ? file.folderPath || 'Knowledge bank' : null,
    file.description?.trim() || file.fileName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="group flex min-h-[56px] items-center gap-3 border-t border-line-soft px-4 py-2 text-[14px] first:border-t-0 hover:bg-surface-sunken md:px-5">
      <FileBadge name={file.fileName} />
      <span className="min-w-0 flex-1">
        <Link href={readerHref} className="block truncate font-medium text-ink hover:underline" title={file.title}>
          {file.title}
        </Link>
        <span className="block truncate text-[12.5px] text-ink-muted" title={second}>
          {second}
        </span>
      </span>
      <time dateTime={file.createdAt} className="w-[72px] flex-none text-right text-[12.5px] tabular-nums text-ink-muted">
        {plainDate(file.createdAt)}
      </time>
      {/* The date alone stays on the row; the file actions show on hover and focus. */}
      <span className="flex flex-none items-center gap-1.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <button
          type="button"
          className={ICON_BTN}
          disabled={isDownloading}
          onClick={() => onDownload(file)}
          aria-label={`Download ${file.title}`}
          title="Download"
        >
          {isDownloading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        </button>
        {canDelete ? (
          <button
            type="button"
            className={cn(ICON_BTN, 'hover:border-danger/40 hover:bg-danger-soft hover:text-danger')}
            onClick={() => onDelete(file)}
            aria-label={`Delete ${file.title}`}
            title="Delete"
          >
            <Trash2 aria-hidden />
          </button>
        ) : null}
      </span>
    </li>
  );
}

interface KnowledgeBankPageViewProps {
  basePath: string;
  canDelete: boolean;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  selectedFile: File | null;
  setSelectedFile: (value: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  handleUpload: (e: FormEvent) => Promise<void>;
  folderName: string;
  setFolderName: (value: string) => void;
  creatingFolder: boolean;
  handleCreateFolder: (e: FormEvent) => Promise<void>;
  libraryQuery: UseQueryResult<{ files: KnowledgeBankFile[]; folders: KnowledgeBankFolder[] }, Error>;
  filteredFiles: KnowledgeBankFile[];
  filteredFolders: KnowledgeBankFolder[];
  q: string;
  setQ: (value: string) => void;
  searching: boolean;
  currentFolderId: string | null;
  ancestors: KnowledgeBankFolder[];
  openFolder: (folderId: string | null) => void;
  folderIsEmpty: (folderId: string) => boolean;
  /** Documents filed directly in a folder, for the shelf. */
  folderDocCount: (folderId: string) => number;
  handleDownload: (file: KnowledgeBankFile) => Promise<void>;
  downloadingId: string | null;
  deleteTarget: KnowledgeBankDeleteTarget | null;
  setDeleteTarget: (value: KnowledgeBankDeleteTarget | null) => void;
  confirmDelete: () => Promise<void>;
  deleting: boolean;
}

export function KnowledgeBankPageView(props: KnowledgeBankPageViewProps) {
  const {
    basePath, canDelete, title, setTitle, description, setDescription,
    selectedFile, setSelectedFile, fileInputRef, uploading, handleUpload,
    folderName, setFolderName, creatingFolder, handleCreateFolder,
    libraryQuery, filteredFiles, filteredFolders, q, setQ, searching,
    currentFolderId, ancestors, openFolder, folderIsEmpty, folderDocCount, handleDownload,
    downloadingId, deleteTarget, setDeleteTarget, confirmDelete, deleting,
  } = props;

  const [folderOpen, setFolderOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const wasCreatingRef = useRef(false);

  // The page clears the folder name only when the folder was created; close the dialog then.
  useEffect(() => {
    if (wasCreatingRef.current && !creatingFolder && !folderName) {
      setFolderOpen(false);
    }
    wasCreatingRef.current = creatingFolder;
  }, [creatingFolder, folderName]);

  function focusUpload() {
    titleRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    titleRef.current?.focus({ preventScroll: true });
  }

  function resetUploadForm() {
    if (uploading) return;
    setTitle('');
    setDescription('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeFolderDialog() {
    if (creatingFolder) return;
    setFolderOpen(false);
    setFolderName('');
  }

  const currentName = ancestors.at(-1)?.name;
  const loading = libraryQuery.isLoading;
  const docsTitle = searching
    ? `${filteredFiles.length} ${filteredFiles.length === 1 ? 'match' : 'matches'}`
    : `${currentName ?? 'Knowledge bank'} · ${filteredFiles.length} ${filteredFiles.length === 1 ? 'document' : 'documents'}`;
  const nothingHere = filteredFolders.length === 0 && filteredFiles.length === 0;

  return (
    <PageTransition>
      <SEO
        title="Knowledge Bank — VCFO Suite"
        description="Shared reference library for managers and project leads."
        path={basePath}
      />
      {/* The top bar names the page, so the page keeps a hidden heading and a plain toolbar. */}
      <h1 className="sr-only">Knowledge bank</h1>

      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <nav aria-label="Folder path" className="mr-auto flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-ink-muted">
            <button
              type="button"
              onClick={() => openFolder(null)}
              className={cn('rounded-mark px-1 py-0.5 hover:text-ink', !currentFolderId && 'font-medium text-ink')}
              aria-current={!currentFolderId ? 'page' : undefined}
            >
              All
            </button>
            {ancestors.map((folder, index) => {
              const last = index === ancestors.length - 1;
              return (
                <span key={folder.id} className="inline-flex min-w-0 items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  <button
                    type="button"
                    onClick={() => openFolder(folder.id)}
                    className={cn('max-w-[12rem] truncate rounded-mark px-1 py-0.5 hover:text-ink', last && 'font-medium text-ink')}
                    aria-current={last ? 'page' : undefined}
                  >
                    {folder.name}
                  </button>
                </span>
              );
            })}
          </nav>
          <label className="flex h-control-md w-full items-center gap-2 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-focus-ring/25 sm:w-[260px]">
            <Search className="h-[15px] w-[15px] text-ink-muted" strokeWidth={1.6} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files by name…"
              aria-label="Search files by name"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
          <Button type="button" variant="outline" onClick={() => setFolderOpen(true)}>
            New folder
          </Button>
          <Button type="button" onClick={focusUpload}>
            Upload document
          </Button>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid min-w-0 gap-4">
            {loading ? (
              // L1 (R-48): the shelves card keeps its place while the library loads.
              <DashSection title="Shelves" loading loadingVariant="block" bodyClassName="px-4 pb-4 pt-3">
                <div className="h-24" />
              </DashSection>
            ) : filteredFolders.length > 0 ? (
              <DashSection title={searching ? 'Matching folders' : 'Shelves'} bodyClassName="px-4 pb-4 pt-3">
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                  {filteredFolders.map((folder) => (
                    <FolderShelf
                      key={folder.id}
                      folder={folder}
                      count={folderDocCount(folder.id)}
                      canDelete={canDelete}
                      empty={folderIsEmpty(folder.id)}
                      onOpen={openFolder}
                      onDelete={(value) => setDeleteTarget({ kind: 'folder', folder: value })}
                    />
                  ))}
                </div>
              </DashSection>
            ) : null}

            <DashSection title={loading ? 'Documents' : docsTitle} bodyClassName="p-0" loading={loading}>
              {loading ? (
                <div className="h-60" aria-busy="true" aria-label="Loading the knowledge bank" />
              ) : libraryQuery.isError ? (
                <div className="p-4">
                  <EmptyState
                    title="Could not load the knowledge bank"
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => void libraryQuery.refetch()}>
                        Try again
                      </Button>
                    }
                  />
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title={
                      searching
                        ? 'No documents match your search'
                        : nothingHere && currentFolderId
                          ? 'This folder is empty'
                          : nothingHere
                            ? 'No documents yet'
                            : 'No documents in this folder'
                    }
                    action={
                      searching ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setQ('')}>
                          Clear search
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={focusUpload}>
                          Upload document
                        </Button>
                      )
                    }
                  />
                </div>
              ) : (
                <ul>
                  {filteredFiles.map((file) => (
                    <DocumentRow
                      key={file.id}
                      file={file}
                      canDelete={canDelete}
                      downloadingId={downloadingId}
                      showFolderPath={searching}
                      readerHref={`${basePath}/${file.id}`}
                      onDownload={handleDownload}
                      onDelete={(value) => setDeleteTarget({ kind: 'file', file: value })}
                    />
                  ))}
                </ul>
              )}
            </DashSection>
          </div>

          <DashSection title="Upload to library" meta={currentName ? `Into ${currentName}` : undefined}>
            <form
              onSubmit={(e) => {
                void handleUpload(e);
              }}
              className="grid gap-3"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="kb-title" className="text-[13px] font-medium text-ink-2">Title</Label>
                <Input
                  id="kb-title"
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Board resolution checklist"
                  maxLength={200}
                  disabled={uploading}
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-[13px] font-medium text-ink-2">File</span>
                <div
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-md border-dash-fine px-4 py-5 text-center',
                    dragging ? 'bg-brand-soft [--dash-color:oklch(var(--brand))]' : 'bg-surface-raised',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (uploading) return;
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) setSelectedFile(dropped);
                  }}
                >
                  {selectedFile ? (
                    <span className="flex max-w-full items-center gap-2">
                      <FileBadge type={fileType(selectedFile.name)} />
                      <span className="truncate text-[14px] text-ink" title={selectedFile.name}>
                        {selectedFile.name}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-soft text-brand-text" aria-hidden>
                        <Upload className="h-[18px] w-[18px]" strokeWidth={1.6} />
                      </span>
                      <span className="text-[15px] font-medium text-ink">Drop a file here</span>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? 'Change file' : 'Choose file'}
                  </Button>
                  <input
                    id="kb-file"
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    aria-label="File"
                    tabIndex={-1}
                    accept=".pdf,.doc,.docx,.xlsx,.pptx,.txt,.jpg,.jpeg,.png,.webp"
                    disabled={uploading}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="kb-description" className="text-[13px] font-medium text-ink-2">When to use this document…</Label>
                <Textarea
                  id="kb-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  disabled={uploading}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={uploading} onClick={resetUploadForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {uploading ? 'Uploading…' : 'Upload to library'}
                </Button>
              </div>
            </form>
          </DashSection>
        </div>
      </div>

      <Dialog
        open={folderOpen}
        onOpenChange={(open) => {
          if (open) setFolderOpen(true);
          else closeFolderDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>{currentName ? `Inside ${currentName}` : 'In the knowledge bank'}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              void handleCreateFolder(e);
            }}
            className="grid gap-4 py-1"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="kb-folder-name">Folder name</Label>
              <Input
                id="kb-folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="GST"
                maxLength={80}
                disabled={creatingFolder}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the first field when this form opens
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" disabled={creatingFolder} onClick={closeFolderDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingFolder || !folderName.trim()}>
                {creatingFolder ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {creatingFolder ? 'Creating…' : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === 'folder' ? 'Delete this folder?' : 'Delete this document?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'folder'
                ? `"${deleteTarget.folder.name}" will be removed. Only empty folders can be deleted.`
                : deleteTarget?.kind === 'file'
                  ? `"${deleteTarget.file.title}" will be permanently removed from the knowledge bank. This cannot be undone.`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
