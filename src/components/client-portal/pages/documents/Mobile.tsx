'use client';

/**
 * Documents — phone (prototype s/docs/docs_a_mobile.dc.html, menu-sheet
 * variant docs_a_mobile_menu): path-based drill (Documents / Phase / Step)
 * with a back crumb, filter + level kebab, 56 px rows, bottom action sheets
 * (incl. Take photo = camera capture), ZIP toast. A file tap opens the phone
 * preview sheet. The board's own 56 px header is the shell's phone top bar.
 * C-618: under the filter, a sideways toolbar keeps the desktop controls on the phone: Status
 * and Replaced toggles, By step / By category, Download all (ZIP) and Upload · N requested.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientDocumentsPayload, DocNode } from '@/lib/client-portal/documents';
import type { PortalIncorporationModel } from '@/lib/client-portal/step-model';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { stepHref } from '@/components/client-portal/routes';
import { dayMonth } from './file-types';
import { buildEntries, folderCounts, missingLabel, STATUS_TONE, stripNo, tagStyle, tagText, tagTip, type TEntry, type TFolder, type View } from './model';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { copyText, docLink, downloadNode, PagePortal, type useZipToast } from './shared-ui';

const I = {
  zip: 'M6 3.5h8l4 4v13H6Z M10 3.5v2 M10 7.5v2 M10 11.5v2 M9 16h2v3H9Z',
  dl: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19.5h14',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z',
  step: 'M4.5 4.5h15v15h-15Z M9 12h6 M12 9l3 3-3 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  up: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M5 19.5h14',
  cam: 'M4.5 8.5h3l1.5-2h6l1.5 2h3v10h-15Z M12 10.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z',
};

interface SheetItem {
  label: string;
  icon: string;
  k?: string;
  act: () => void;
}

export function DocsMobile({
  data,
  model,
  view,
  setView,
  zip,
  onOpenFile,
  onUpload,
}: {
  data: ClientDocumentsPayload;
  model: PortalIncorporationModel;
  view: View;
  setView: (v: View) => void;
  zip: ReturnType<typeof useZipToast>;
  onOpenFile: (n: DocNode, list: DocNode[]) => void;
  onUpload: (requestId?: string, file?: File) => void;
}) {
  // Staff see this inside a card that clips, so the controls wrap there instead of scrolling past its edge.
  const { go, engagementId: staffView } = usePortal();
  const [statusOn, setStatusOn] = useState(true);
  const [hid, setHid] = useState(false);
  const entries = useMemo(() => buildEntries(data.nodes, model, view).filter((e) => e.kind === 'folder' || hid || !e.node.replaced), [data.nodes, model, view, hid]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const [path, setPath] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<string>('');
  const camRef = useRef<HTMLInputElement>(null);
  const camFor = useRef<string | undefined>(undefined);

  // deep link ?folder= / ?doc=
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('folder') ?? (p.get('doc') ? byId.get(p.get('doc')!)?.parent ?? null : null);
    if (!id || !byId.has(id)) return;
    const chain: string[] = [];
    let cur: string | null = id;
    while (cur) {
      chain.unshift(cur);
      cur = byId.get(cur)?.parent ?? null;
    }
    setPath(chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId.size]);

  const files = entries.filter((e): e is Extract<TEntry, { kind: 'file' }> => e.kind === 'file');
  const anc = useCallback(
    (e: TEntry) => {
      const out: string[] = [];
      let p = e.parent;
      while (p) {
        out.push(p);
        p = byId.get(p)?.parent ?? null;
      }
      return out;
    },
    [byId],
  );
  const under = (id: string) => files.filter((f) => anc(f).includes(id)).map((f) => f.node);
  const cur = path.length ? path[path.length - 1]! : null;
  const curFolder = cur ? (byId.get(cur) as TFolder | undefined) : undefined;
  const ql = q.trim().toLowerCase();
  const level = ql ? files.filter((f) => f.node.label.toLowerCase().includes(ql)) : entries.filter((e) => e.parent === cur);
  const filesHere = level.filter((e): e is Extract<TEntry, { kind: 'file' }> => e.kind === 'file').map((e) => e.node).filter((n) => n.status !== 'Missing');
  const shownCount = ql ? level.length : files.length;
  const allZip = files.filter((f) => f.node.status !== 'Missing' && !f.node.replaced).length;
  const openReq = data.openRequests.length;

  const close = () => setSheet('');
  const startZip = (key: string, name: string, n: number) => {
    close();
    void zip.startZip(key, name, n);
  };
  const copy = async (param: 'doc' | 'folder', id: string) => {
    close();
    if (await copyText(docLink(param, id))) zip.copied();
  };

  let sheetTitle = '';
  let items: SheetItem[] = [];
  if (sheet === 'root') {
    // docs_a_mobile_menu root sheet: the whole tree as one ZIP + a link to it. Uploads start
    // from a missing row's own sheet (upload only against open requests).
    sheetTitle = 'Documents';
    items = [
      { label: 'Download folder as ZIP', icon: I.zip, k: `${allZip} files`, act: () => startZip('all', `${data.companyShort} documents`, allZip) },
      {
        label: 'Copy link to folder',
        icon: I.link,
        act: () => {
          close();
          void copyText(`${window.location.origin}/app/client/documents`).then((ok) => ok && zip.copied());
        },
      },
    ];
  } else if (sheet) {
    const e = byId.get(sheet);
    if (e?.kind === 'folder') {
      const n = under(e.id).filter((x) => x.status !== 'Missing').length;
      sheetTitle = e.label;
      items = [
        { label: 'Download folder as ZIP', icon: I.zip, k: `${n} files`, act: () => startZip(e.zipKey, stripNo(e.label), n) },
        { label: 'Copy link to folder', icon: I.link, act: () => void copy('folder', e.id) },
      ];
    } else if (e?.kind === 'file') {
      const f = e.node;
      const sn = f.stepId ? model.byId[f.stepId]?.n : undefined;
      const openStep: SheetItem[] = sn ? [{ label: `Open step ${sn}`, icon: I.step, act: () => (close(), go(stepHref(f.stepId!))) }] : [];
      sheetTitle = f.label;
      items =
        f.status === 'Missing'
          ? [
              {
                label: 'Take photo',
                icon: I.cam,
                act: () => {
                  close();
                  camFor.current = f.requestId;
                  camRef.current?.click();
                },
              },
              { label: 'Choose file', icon: I.up, act: () => (close(), onUpload(f.requestId)) },
              ...openStep,
              { label: 'Copy link', icon: I.link, act: () => void copy('doc', f.id) },
            ]
          : [
              { label: 'Download', icon: I.dl, act: () => (close(), downloadNode(f)) },
              { label: 'Preview', icon: I.eye, act: () => (close(), onOpenFile(f, filesHere)) },
              ...openStep,
              { label: 'Copy link', icon: I.link, act: () => void copy('doc', f.id) },
            ];
    }
  }

  useEffect(() => {
    if (!sheet) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSheet('');
      }
    };
    document.addEventListener('keydown', key);
    const t = setTimeout(() => (document.querySelector('.vdm-sheet button') as HTMLElement | null)?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', key);
      clearTimeout(t);
    };
  }, [sheet]);

  const title = curFolder?.label ?? 'Documents';
  const crumb = ['Documents', ...path.slice(0, -1).map((p) => (byId.get(p) as TFolder | undefined)?.label.split(' — ')[0] ?? '')].join(' / ');
  const backLabel = path.length > 1 ? (byId.get(path[path.length - 2]!) as TFolder | undefined)?.label ?? 'Documents' : 'Documents';
  const t = zip.toast;

  return (
    <div className="vdm">
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
        {path.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 44 }}>
            <button type="button" className="tbb" aria-label={`Back to ${backLabel}`} onClick={() => setPath((p) => p.slice(0, -1))} style={{ marginLeft: -10, color: 'oklch(var(--ink))' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 6l-6 6 6 6" />
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'oklch(var(--ink-muted))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb}</div>
              <h1 style={{ margin: 0, font: '500 18px/1.25 var(--font-sans),sans-serif', color: 'oklch(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="sx-in" style={{ height: 44, flex: 1, minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z M16 16l4 4" />
            </svg>
            <input type="search" aria-label="Filter documents" placeholder="Filter documents" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 16 }} />
            <span className="n">
              {shownCount}/{files.length}
            </span>
          </label>
          <button
            type="button"
            className="kb"
            style={{ border: '1.5px solid oklch(var(--line-strong))', background: 'oklch(var(--surface-raised))', borderRadius: 6, boxSizing: 'border-box' }}
            aria-label={`More actions for ${title}`}
            aria-haspopup="menu"
            onClick={() => setSheet(cur ?? 'root')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="18.5" r="1.8" />
            </svg>
          </button>
        </div>
        <div className={staffView ? 'vdm-tools wrap' : 'vdm-tools'} role="toolbar" aria-label="Document controls">
          <button type="button" className="sx-filter" aria-pressed={statusOn} onClick={() => setStatusOn((v) => !v)}>
            <span className="vdm-dots" aria-hidden="true">
              <i style={{ background: 'oklch(var(--positive-mid))' }} />
              <i style={{ background: 'oklch(var(--brand))' }} />
              <i style={{ background: 'oklch(var(--warning-mid))' }} />
            </span>
            Status
          </button>
          <button type="button" className="sx-filter" aria-pressed={hid} onClick={() => setHid((v) => !v)}>
            Replaced
          </button>
          <div className="sx-seg" role="tablist" aria-label="Arrange by">
            {(['By step', 'By category'] as const).map((l, i) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={view === i}
                className={view === i ? 'on' : ''}
                onClick={() => {
                  setPath([]);
                  setView(i as View);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="sx-btn sm" disabled={!allZip} onClick={() => startZip('all', `${data.companyShort} documents`, allZip)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={I.dl} />
            </svg>
            Download all (ZIP)
          </button>
          {openReq > 0 ? (
            <button type="button" className="sx-btn sm p" onClick={() => onUpload()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={I.up} />
              </svg>
              Upload · {openReq} requested
            </button>
          ) : null}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '12px 16px 16px' }}>
        {level.length ? (
          <div key={`${cur}-${ql ? 'q' : ''}`} className="lvl sx-card" role="list">
            {level.map((e) => {
              if (e.kind === 'folder') {
                const kids = under(e.id);
                const c = folderCounts(kids);
                const bar = e.level !== 'phase';
                return (
                  <div className="row" role="listitem" key={e.id}>
                    <button type="button" className="main" onClick={() => setPath((p) => [...p, e.id])}>
                      <span className="fico" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 18.5V5.5A1.5 1.5 0 0 1 4.5 4h4.2l2 2.4h8.8A1.5 1.5 0 0 1 21 7.9v10.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" fill="currentColor" />
                        </svg>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</span>
                        {bar && c.tot ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }} role="img" aria-label={`${stripNo(e.label)} · ${c.ok} received · ${c.rv} in review · ${c.ms} missing`}>
                            <span className="trk">
                              <span style={{ background: 'oklch(var(--positive-mid))', width: `${(c.ok / c.tot) * 100}%` }} />
                              <span style={{ background: 'oklch(var(--brand))', width: `${(c.rv / c.tot) * 100}%` }} />
                              <span style={{ background: 'oklch(var(--warning-mid))', width: `${(c.ms / c.tot) * 100}%` }} />
                            </span>
                            <span className="mono vdm-n">
                              {c.ok}/{c.tot}
                            </span>
                          </span>
                        ) : null}
                      </span>
                      <span className="mono vdm-n">{bar ? '' : kids.length}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(var(--ink-muted))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                    <button type="button" className="kb" aria-label={`More actions for ${e.label}`} aria-haspopup="menu" onClick={() => setSheet(e.id)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5.5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="18.5" r="1.8" />
                      </svg>
                    </button>
                  </div>
                );
              }
              const f = e.node;
              const missing = f.status === 'Missing';
              return (
                <div className="row" role="listitem" key={e.id}>
                  <button type="button" className="main" onClick={() => (missing ? setSheet(e.id) : onOpenFile(f, filesHere))}>
                    {missing ? (
                      <span className="ft-miss" role="img" aria-label="Not uploaded yet" />
                    ) : (
                      <span className="ft" role="img" aria-label={tagTip(f)} style={tagStyle(f)}>
                        {tagText(f)}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {statusOn || f.replaced ? (
                          <span className="cp-tw">{f.replaced ? <Tag>Replaced</Tag> : <Chip tone={STATUS_TONE[f.status]}>{f.status}</Chip>}</span>
                        ) : null}
                        <span className="mono vdm-n" style={missing && f.overdue ? { color: 'oklch(var(--danger))' } : undefined}>
                          {missing ? missingLabel(f) : dayMonth(f.date)}
                        </span>
                      </span>
                    </span>
                  </button>
                  <button type="button" className="kb" aria-label={`More actions for ${f.label}`} aria-haspopup="menu" onClick={() => setSheet(e.id)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5.5" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="12" cy="18.5" r="1.8" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sx-empty" role="status" style={{ margin: 0 }}>
            {ql ? (
              <>
                <span>No document matches “{q.trim()}”</span>
                <button type="button" className="sx-btn sm" onClick={() => setQ('')}>
                  Clear filter
                </button>
              </>
            ) : (
              <span>None</span>
            )}
          </div>
        )}
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUpload(camFor.current, file);
        }}
      />

      {sheet && items.length ? (
        <PagePortal>
          <div className="vdm">
            <button type="button" aria-label="Close menu" data-notip="" onClick={close} style={{ position: 'fixed', inset: 0, border: 0, padding: 0, background: 'oklch(var(--side) / .55)', cursor: 'default', zIndex: 2147482300 }} />
            <div
              className="vdm-sheet"
              role="menu"
              aria-label={`Actions for ${sheetTitle}`}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2147482301, background: 'oklch(var(--surface-raised))', borderRadius: '6px 6px 0 0', padding: '8px 0 76px', maxHeight: 'calc(100dvh - 24px)', overflow: 'auto', boxSizing: 'border-box', boxShadow: 'var(--shadow-float)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ width: 40, height: 4, borderRadius: 3, background: 'oklch(var(--line-strong))' }} />
              </div>
              <div style={{ padding: '6px 20px 10px', font: '500 15px var(--font-sans),sans-serif', color: 'oklch(var(--ink))', borderBottom: '1px solid oklch(var(--line-soft))' }}>{sheetTitle}</div>
              {items.map((m) => (
                <button key={m.label} type="button" role="menuitem" onClick={m.act}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'oklch(var(--ink-muted))' }}>
                    <path d={m.icon} />
                  </svg>
                  {m.label}
                  <span className="mono vdm-n" style={{ marginLeft: 'auto' }}>
                    {m.k ?? ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </PagePortal>
      ) : null}

      {t ? (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--vp-launch-h, 76px) + 8px)', zIndex: 2147482302, padding: '10px 12px', borderRadius: 6, background: 'oklch(var(--side))', color: 'oklch(var(--on-brand))', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-float)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.error ?? (t.copy ? 'Link copied' : t.done ? `Downloaded ${t.name}` : `Preparing ${t.name}…`)}</span>
            <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>
              {t.error || t.copy ? '' : t.done ? `${t.total} files` : `${t.n} of ${t.total}`}
            </span>
            <button type="button" aria-label="Dismiss" onClick={zip.dismiss} style={{ width: 32, height: 32, border: 0, borderRadius: 6, background: 'none', color: 'oklch(var(--on-brand))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {!t.done ? (
            <div style={{ height: 4, borderRadius: 3, background: 'oklch(100% 0 0 / .18)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', background: 'oklch(var(--brand))', width: `${t.total ? (t.n / t.total) * 100 : 0}%`, transition: 'width .25s' }} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

