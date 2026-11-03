'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, Link2Off, Pencil, Plus } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { DangerConfirm } from '@/components/ui/danger-confirm';
import { EmptyState } from '@/components/ui/empty-state';
import { Chip, Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { describeShareFilters } from '@/lib/receivables/share-filters';
import { SHARE_VISIBILITY_LABEL, type ShareLinkDto, type ShareVisibility } from '@/lib/receivables/share-wire';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import { useShareLinkActions, useShareLinks } from '@/hooks/use-receivables-share-links';
import { stamp } from '../format';
import { copyShareLink } from './share-link-actions';
import { ShareViewDialog } from './ShareViewDialog';

/**
 * The Links tab (Phase 10, docs/specs/receivables/PLAN.md): every shared view of the sheet, newest
 * first, with who may open it, its expiry, how often it was opened and by whom. Copy, Edit (the
 * share dialog in edit mode) and Revoke act on one link; New link shares the whole open sheet.
 */

const VIS_TONE: Record<ShareVisibility, ChipTone> = { public: 'warn', login: 'prog', restricted: 'violet' };

function linkState(link: ShareLinkDto, now: number): { label: string; tone: ChipTone } | null {
  if (link.revokedAt) return { label: 'Revoked', tone: 'idle' };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now) return { label: 'Expired', tone: 'idle' };
  return null;
}

export function LinksTab({ data }: { data: ManagerSheetDto }) {
  const sheetId = data.sheet.id;
  const links = useShareLinks(sheetId);
  const actions = useShareLinkActions(sheetId);
  const [dialog, setDialog] = useState<{ link: ShareLinkDto | null } | null>(null);
  const [revoking, setRevoking] = useState<ShareLinkDto | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const partnerNames = useMemo(() => Object.fromEntries(data.partners.map((p) => [p.slug, p.name])), [data.partners]);
  const now = Date.now();
  const list = links.data ?? [];
  const live = list.filter((l) => !linkState(l, now)).length;

  return (
    <>
      <DashSection
        title="Shared views"
        meta={links.data ? `${live} live of ${list.length}` : undefined}
        right={
          <Button size="sm" onClick={() => setDialog({ link: null })}>
            <Plus aria-hidden /> New link
          </Button>
        }
        flush
        loading={links.isLoading}
      >
        {links.error ? <p className="px-4 py-6 text-[13px] text-danger">{links.error.message}</p> : null}
        {links.data && !list.length ? (
          <div className="p-4">
            <EmptyState
              title="No shared views yet. Share a filtered view from the Sheet tab, or share the whole open sheet."
              action={
                <Button size="sm" variant="secondary" onClick={() => setDialog({ link: null })}>
                  New link
                </Button>
              }
            />
          </div>
        ) : null}
        <ul>
          {list.map((link) => {
            const state = linkState(link, now);
            const open = expanded === link.id;
            return (
              <li key={link.id} className="border-t border-line-soft px-4 py-3 first:border-t-0 md:px-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-[320px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className={cn('break-words font-semibold', state && 'text-ink-muted')}>{link.name}</b>
                      <Chip raw tone={VIS_TONE[link.visibility]}>
                        {SHARE_VISIBILITY_LABEL[link.visibility]}
                      </Chip>
                      {state ? (
                        <Chip raw tone={state.tone}>
                          {state.label}
                        </Chip>
                      ) : null}
                      {!link.allowDownload ? <Tag>No download</Tag> : null}
                    </div>
                    <div className="mt-1 text-[13px] text-ink-2">{describeShareFilters(link.filters, partnerNames)}</div>
                    {link.visibility === 'restricted' && link.allowedEmails.length ? (
                      <div className="mt-0.5 break-words text-[12.5px] text-ink-muted">For {link.allowedEmails.join(', ')}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ink-muted">
                      <span>
                        Created {stamp(link.createdAt)}
                        {link.createdByName ? ` by ${link.createdByName}` : ''}
                      </span>
                      <span>{link.revokedAt ? `Revoked ${stamp(link.revokedAt)}` : link.expiresAt ? `${state ? 'Expired' : 'Expires'} ${stamp(link.expiresAt)}` : 'Never expires'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-ink-2 hover:bg-hover sm:w-auto"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : link.id)}
                    >
                      <span className="font-mono">{link.viewCount}</span> view{link.viewCount === 1 ? '' : 's'}
                      {link.lastViewedAt ? <span className="text-ink-muted">· last {stamp(link.lastViewedAt)}</span> : null}
                      <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
                    </button>
                    {!link.revokedAt ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => void copyShareLink(link.url)}>
                          <Copy aria-hidden /> Copy
                        </Button>
                        <Button size="iconSm" variant="quiet" asChild title="Open the view">
                          <a href={link.url} target="_blank" rel="noreferrer" aria-label={`Open ${link.name}`}>
                            <ExternalLink aria-hidden />
                          </a>
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ link })}>
                          <Pencil aria-hidden /> Edit
                        </Button>
                        <Button size="sm" variant="quiet" className="text-danger" onClick={() => setRevoking(link)}>
                          <Link2Off aria-hidden /> Revoke
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {open ? (
                  <div className="mt-2.5 rounded-md border border-line-soft bg-surface-sunken px-3 py-2">
                    {link.viewers.length ? (
                      <ul className="grid gap-1 text-[12.5px]">
                        {link.viewers.map((v, i) => (
                          <li key={`${v.viewedAt}-${i}`} className="flex flex-wrap justify-between gap-x-3">
                            <span className="min-w-0 truncate">
                              {v.viewerName ? <span className="font-medium">{v.viewerName}</span> : null}
                              {v.viewerEmail ? <span className="text-ink-muted">{v.viewerName ? ` · ${v.viewerEmail}` : v.viewerEmail}</span> : null}
                              {!v.viewerName && !v.viewerEmail ? <span className="text-ink-muted">Someone without a login</span> : null}
                            </span>
                            <span className="font-mono text-ink-muted">{stamp(v.viewedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12.5px] text-ink-muted">Nobody has opened this link yet.</p>
                    )}
                    {link.viewCount > link.viewers.length ? <p className="mt-1 text-[12px] text-ink-faint">The latest {link.viewers.length} of {link.viewCount} openings.</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </DashSection>

      <ShareViewDialog
        sheetId={sheetId}
        filters={dialog?.link?.filters ?? {}}
        partnerNames={partnerNames}
        open={Boolean(dialog)}
        onOpenChange={(o) => !o && setDialog(null)}
        link={dialog?.link ?? null}
      />

      <DangerConfirm
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name ?? ''}”?`}
        body="The link stops working at once for everyone. Its view log stays here. This cannot be undone; share a new link if you need one."
        word="REVOKE"
        confirm="Revoke link"
        icon={Link2Off}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await actions.revoke.mutateAsync(revoking.id);
            toastSuccess('Link revoked', revoking.name);
            setRevoking(null);
          } catch (e) {
            toastError('Could not revoke', e instanceof Error ? e.message : undefined);
          }
        }}
      />
    </>
  );
}
