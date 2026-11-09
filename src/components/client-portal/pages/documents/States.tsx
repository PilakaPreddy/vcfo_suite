'use client';

/**
 * Documents page states: loading skeleton (s/docs/docs_a_loading.dc.html, grey
 * shapes per R-48), the empty explorer (a plain-edged area with the action) and the
 * load error card. There is no page title; the title lives in the top-bar trail.
 */
import type { CSSProperties } from 'react';

const CARD: CSSProperties = { flex: 1, minHeight: 0 };

function Sk({ w, h, r, style }: { w: number | string; h: number; r?: number; style?: CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, flex: 'none', ...style }} />;
}

export function DocsLoading({ phone }: { phone?: boolean }) {
  if (phone) {
    return (
      <div className="vds-root" aria-busy="true" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Sk w="100%" h={44} r={6} />
        <div className="sx-card">
          {[200, 170, 220, 150, 190].map((w) => (
            <div key={w} className="r" style={{ height: 56 }}>
              <Sk w={20} h={20} r={6} />
              <Sk w={w} h={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const tree: Array<[number, number, boolean?]> = [
    [0, 210],
    [36, 170, true],
    [60, 190],
    [60, 150],
    [0, 190],
    [36, 140, true],
    [60, 200],
    [60, 160],
    [60, 180],
    [36, 180, true],
    [0, 220],
  ];
  return (
    <section className="vds-root sx-card" aria-label="Loading documents" aria-busy="true" style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 12px', borderBottom: '1px solid oklch(var(--line-soft))', flexWrap: 'wrap', overflow: 'hidden' }}>
        <Sk w={260} h={36} r={6} style={{ maxWidth: '100%', flexShrink: 1 }} />
        <Sk w={84} h={30} r={6} />
        <Sk w={96} h={30} r={6} />
        <Sk w={200} h={32} r={6} />
        <span style={{ flex: 1 }} />
        <Sk w={170} h={30} r={6} />
      </div>
      <div className="vds-body" style={{ flex: 1, display: 'flex' }}>
        <div className="vds-tree" style={{ width: 420, borderRight: '1px solid oklch(var(--line-soft))', padding: '8px 0' }}>
          {tree.map(([pad, w, bar], i) => (
            <div key={i} className="r" style={{ paddingLeft: pad || 12 }}>
              {pad === 60 ? <Sk w={22} h={16} r={3} /> : <Sk w={16} h={16} />}
              <Sk w={w} h={10} />
              {bar ? (
                <>
                  <span style={{ flex: 1 }} />
                  <Sk w={56} h={4} />
                </>
              ) : null}
            </div>
          ))}
        </div>
        <div className="vds-pane vds-hide-md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 16px', borderBottom: '1px solid oklch(var(--line-soft))' }}>
            <Sk w={44} h={24} r={4} />
            <Sk w={240} h={12} />
            <span style={{ flex: 1 }} />
            <Sk w={30} h={30} r={6} />
            <Sk w={30} h={30} r={6} />
          </div>
          <div style={{ flex: 1, background: 'oklch(var(--surface-sunken))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sk w={340} h={440} r={4} style={{ maxHeight: '90%', background: 'oklch(var(--surface-raised))' }} />
          </div>
          <div style={{ height: 44, borderTop: '1px solid oklch(var(--line-soft))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <Sk w={60} h={10} />
            <Sk w={180} h={10} />
          </div>
          <div style={{ height: 44, borderTop: '1px solid oklch(var(--line-soft))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <Sk w={50} h={10} />
            <Sk w={120} h={10} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** R-48: no documents yet is a plain-edged area with the actions. */
export function DocsEmpty({ canUpload, onUpload, onOpenInc }: { canUpload: boolean; onUpload: () => void; onOpenInc: () => void }) {
  return (
    <section className="sx-card" aria-label="Document explorer" style={CARD}>
      <div className="sx-empty" role="status" style={{ flex: 1 }}>
        <span>No documents yet</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {canUpload ? (
            <button type="button" className="sx-btn sm p" onClick={onUpload}>
              Upload a document
            </button>
          ) : null}
          <button type="button" className="sx-btn sm" onClick={onOpenInc}>
            Open incorporation
          </button>
        </div>
      </div>
    </section>
  );
}

export function DocsError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="sx-card" style={CARD}>
      <div className="vdoc-err" role="alert">
        <span className="vdoc-err-ic" aria-hidden="true">
          !
        </span>
        <span style={{ flex: 1 }}>Could not load documents</span>
        <button type="button" className="sx-btn sm" onClick={onRetry}>
          Retry
        </button>
      </div>
    </section>
  );
}
