'use client';

/**
 * Credentials page — board `s/home/v7p_credentials.dc.html` (route
 * `credentials`). Six tinted identifier tiles + a five-sheet workbook
 * (Address · Login credentials · Registrations · Directors KYC · Other
 * credentials). Secret values stay masked; every Preview / Edit / Reveal asks
 * for a 6-digit OTP that goes to the client's Project Manager and opens a
 * 10-minute grant (server-enforced, `src/db/repositories/credentials/`).
 * Every access lands in the Access log drawer and on the Audit page.
 */
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePortalOptional } from '@/components/client-portal/PortalProvider';
import { DocViewer } from '@/components/client-portal/pages/documents/DocViewer';
import { CRED_TABS, type CredSheet } from '@/lib/client-portal/credentials';
import { Ic } from './Ic';
import { OtpDialog } from './OtpDialog';
import { AccessLog } from './AccessLog';
import { useCredentialsState } from './use-credentials-state';
import { createCellControls } from './cell-controls';
import { createIdTiles } from './id-tiles';
import { createSheetGrid } from './sheet-grid';
import '../../css/credentials-page.css';

/** Fallback for staff who open /app/client/* outside the client portal shell. */
export function CredentialsPage() {
  const portal = usePortalOptional();
  if (!portal) {
    return (
      <div style={{ padding: 24, font: '600 14px var(--font-sans),system-ui,sans-serif' }}>
        Credentials are shown inside the client portal. Open the engagement&apos;s workspace to manage them.
      </div>
    );
  }
  return <CredentialsInner />;
}

function CredentialsInner() {
  const state = useCredentialsState();
  const controls = createCellControls(state);
  const tiles = createIdTiles({ ...state, ...controls });
  const sheetGrid = createSheetGrid({ ...state, ...controls });
  const {
    after,
    toast,
    go,
    engQ,
    q,
    data,
    tab,
    setTab,
    otp,
    logOpen,
    setLogOpen,
    viewer,
    setViewer,
    host,
    rootRef,
    sheets,
    T,
    sLabel,
    refocus,
    closeOtp,
    granted,
    needEdit,
    addRow,
    setStage,
    selectTab,
  } = state;
  const {
    modeBtns,
  } = controls;
  const {
    tile,
    idTiles,
    regTile,
    dscTile,
  } = tiles;
  const {
    grid,
  } = sheetGrid;

  const countOf = (id: CredSheet) => (sheets ? sheets[id].rows.filter((r) => !r.spacer).length : 0);
  const idx = CRED_TABS.findIndex((t) => t[0] === tab);
  const stage = after ? 'after' : 'before';

  return (
    <div className="cp-credentials" ref={rootRef}>
      <div className="cr-page">
        <div className="cr-main" id="creds-root">
          <div className="cr-wrap">
            <div className="cr-bar" role="toolbar" aria-label="Credentials">
              <h1 className="sr">Credentials</h1>
              <div className="cr-seg" role="radiogroup" aria-label="Stage">
                <span className="thumb" style={{ transform: `translateX(${stage === 'after' ? 100 : 0}%)` }} />
                <button type="button" role="radio" aria-checked={stage === 'before'} className={stage === 'before' ? 'on' : ''} data-act="stage" data-key="before" onClick={() => setStage('before')}>
                  Before COI
                </button>
                <button type="button" role="radio" aria-checked={stage === 'after'} className={stage === 'after' ? 'on' : ''} data-act="stage" data-key="after" onClick={() => setStage('after')}>
                  After COI
                </button>
              </div>
              <span className="cr-sp" />
              <button type="button" className="cr-btn cr-btn-sm" data-act="log" onClick={() => setLogOpen(true)}>
                <Ic n="history" s={14} />
                Access log
              </button>
            </div>

            {q.isError ? (
              <div className="cr-errbox" role="alert">
                Could not load the credentials. <button type="button" className="cr-link" onClick={() => void q.refetch()}>Try again</button>
              </div>
            ) : !data || !T ? (
              <>
                <section className="cr-ids" aria-label="Company identifiers" aria-busy="true">
                  {['CIN', 'PAN', 'TAN', 'GSTIN', 'Registrations', 'DSC holders'].map((n, i) =>
                    tile(['mca', 'it', 'it', 'gst', 'oth', 'oth'][i]!, n, <span className="sx-sk" style={{ width: '70%', height: 14 }} />),
                  )}
                </section>
                <div className="cr-wb" aria-hidden="true">
                  <div className="cr-wbh">
                    <span className="sx-sk" style={{ width: 360, maxWidth: '60%', height: 28 }} />
                  </div>
                  <div className="cr-skrows">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span className="sx-sk" key={i} style={{ height: 32 }} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <section className="cr-ids" aria-label="Company identifiers">
                  {idTiles()}
                  {regTile()}
                  {dscTile()}
                </section>
                <section className="cr-wb" aria-label="Workbook">
                  <div className="cr-wbh">
                    <div className="cr-segx">
                      <div className="cr-seg cr-seg5" role="tablist" aria-label="Sheets">
                        <span className="thumb" style={{ transform: `translateX(${idx * 100}%)` }} />
                        {CRED_TABS.map(([id, name]) => (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={tab === id ? 'on' : ''}
                            data-act="tab"
                            data-key={id}
                            key={id}
                            onClick={() => selectTab(id)}
                          >
                            {name}
                            <span className="cr-cnt">{countOf(id)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="cr-sel">
                      <span className="sr">Sheet</span>
                      <select
                        id="cr-tabsel"
                        aria-label="Sheet"
                        value={tab}
                        onChange={(e) => {
                          setTab(e.target.value as CredSheet);
                          refocus({ id: 'cr-tabsel' });
                        }}
                      >
                        {CRED_TABS.map(([id, name]) => (
                          <option value={id} key={id}>
                            {name} ({countOf(id)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="cr-sp" />
                    <div className="cr-wbb">
                      {tab === 'kyc' ? (
                        <button type="button" className="sx-btn sm" data-act="add-dir" onClick={() => needEdit('tab:kyc', () => void addRow('kyc'))}>
                          <Ic n="plus" s={13} />
                          Add director
                        </button>
                      ) : null}
                      {modeBtns(`tab:${tab}`, ' cr-btn-sm', false)}
                    </div>
                  </div>
                  {grid(T)}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {host && otp && data
        ? createPortal(
            <div className="cp-credentials" style={{ display: 'contents' } as CSSProperties}>
              <OtpDialog
                key={otp.n}
                mode={otp.mode}
                scope={otp.scope}
                caption={sLabel(otp.scope)}
                manager={data.manager}
                engagementQuery={engQ}
                onClose={closeOtp}
                onGranted={(g) => void granted(g)}
                onFail={(msg) => {
                  toast(msg);
                  closeOtp();
                }}
              />
            </div>,
            host,
          )
        : null}
      {host && logOpen
        ? createPortal(
            <div className="cp-credentials" style={{ display: 'contents' } as CSSProperties}>
              <AccessLog
                engQ={engQ}
                onClose={() => {
                  setLogOpen(false);
                  refocus({ act: 'log' });
                }}
                onAudit={() => go('audit')}
              />
            </div>,
            host,
          )
        : null}
      {viewer ? <DocViewer docs={[viewer]} index={0} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}
