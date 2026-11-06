import type { ReactNode } from 'react';
import {
  CRED_STATUS,
  KYC_ROWS,
  LABEL_COL,
  scopeLabel,
  scopesCovering,
  tabLabel,
  type WireSheet,
} from '@/lib/client-portal/credentials';
import { Ic } from './Ic';
import { fmtS } from './format';
import type { CredentialsState } from './use-credentials-state';
import type { CellControls } from './cell-controls';

/** The spreadsheet grid for one sheet: sticky headers, the row gutter, editable and secret cells, and Add row. */
export function createSheetGrid(ctx: CredentialsState & CellControls) {
  const {
    toast,
    data,
    edit,
    editV,
    setEditV,
    now,
    gridRef,
    editRef,
    until,
    modeOf,
    previewed,
    hasEdit,
    sheets,
    labOf,
    hasSno,
    label,
    isSecretCell,
    editable,
    openOtp,
    endScope,
    needEdit,
    saveChange,
    startEdit,
    commitEdit,
    cancelEdit,
    addRow,
    openCert,
    companyName,
    mgrName,
    copyBtn,
    hideBtn,
    cellChip,
    revealBtn,
    statusChip,
    plain,
    srcChip,
  } = ctx;

  const stickyCls = (S: WireSheet, ci: number) => {
    const c = S.cols[ci]!;
    if (c.k === 'sno') return 'cr-sno';
    if (ci === labOf(S)) return `cr-c0${hasSno(S) ? ' cr-l96' : ''}`;
    return S.id === 'kyc' ? 'cr-eq' : '';
  };
  const rowHasSecret = (S: WireSheet, rowKey: string) => {
    const r = S.rows.find((x) => x.key === rowKey);
    if (!r) return false;
    return S.cols.some((c) => isSecretCell(S, rowKey, c.key) && r.cells[c.key]?.has);
  };

  const editor = (key: string, multi: boolean) => {
    const common = {
      id: 'cr-ed',
      'aria-label': `Edit ${label(key)}`,
      value: editV,
      onChange: (e: { target: { value: string } }) => setEditV(e.target.value),
      onBlur: (e: { target: { value: string } }) => {
        if (edit === key) commitEdit(e.target.value);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !(multi && e.shiftKey)) {
          e.preventDefault();
          commitEdit((e.target as HTMLInputElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit();
        }
      },
    };
    return multi ? (
      <textarea {...common} ref={editRef} className="cr-ed-in cr-ed-ta" rows={3} />
    ) : (
      <input {...common} ref={editRef} className="cr-ed-in" type="text" />
    );
  };

  const onCellActivate = (key: string) => {
    if (edit !== key) startEdit(key);
  };

  const cellTd = (S: WireSheet, ri: number, ci: number) => {
    const row = S.rows[ri]!;
    const col = S.cols[ci]!;
    const key = `${S.id}|${row.key}|${col.key}`;
    const cell = row.cells[col.key];
    const v = cell?.v ?? '';
    const secretCol = isSecretCell(S, row.key, col.key) && ci !== labOf(S);
    const sec = secretCol && Boolean(cell?.has);
    let cls = stickyCls(S, ci);
    const kp = S.id === 'kyc' ? KYC_ROWS.find((p) => p.key === row.key) : undefined;
    if (kp?.indent && ci === labOf(S)) cls += ' cr-ind';
    const tall = Boolean(kp?.tall) && ci !== labOf(S);
    if (tall) cls += ' cr-tall';
    if (col.k === 'sno') {
      let n = 0;
      for (let i = 0; i <= ri; i++) if (!S.rows[i]!.spacer) n++;
      return (
        <td className={cls} key={col.key}>
          {n}
        </td>
      );
    }
    if (S.id === 'kyc' && ci === labOf(S)) {
      return (
        <td className={cls} key={col.key}>
          <span className="cr-lt">{plain(v)}</span>
        </td>
      );
    }
    const can = editable(key);
    if (can) cls += ' cr-can';
    if (edit === key) {
      return (
        <td className={`${cls} cr-editing`} data-edit={key} key={col.key}>
          {editor(key, tall)}
        </td>
      );
    }
    const src = srcChip(cell);
    const srow = src ? <span className="cr-srcrow">{src}</span> : null;
    if (src) cls += ' cr-has-src';
    if (col.k === 'status') {
      return (
        <td className={cls} key={col.key}>
          {can ? (
            <select
              className="cr-stsel"
              aria-label={`Status · ${row.cells[LABEL_COL]?.v ?? ''}`}
              value={v}
              onChange={(e) => {
                if (e.target.value !== v) void saveChange(key, e.target.value);
              }}
            >
              {CRED_STATUS.map((s) => (
                <option key={s[0]}>{s[0]}</option>
              ))}
            </select>
          ) : (
            statusChip(v)
          )}
        </td>
      );
    }
    let inner: ReactNode;
    if (sec) {
      if (previewed(key) && cell?.v != null) {
        const cellOnly = until(`cell:${key}`) > 0 && !scopesCovering(key).filter((s) => !s.startsWith('cell:')).some((s) => until(s) > 0);
        inner = (
          <>
            <span className="cr-cellpad">
              <span className={`cr-mono${tall ? ' cr-pre' : ''}`}>{cell.v}</span>
              {cellOnly ? (
                <>
                  {cellChip(key)}
                  {copyBtn(key, cell.v)}
                  {hideBtn(key)}
                </>
              ) : (
                copyBtn(key, cell.v)
              )}
            </span>
            {srow}
          </>
        );
      } else {
        inner = (
          <>
            <span className="cr-cellpad">
              <span className="cr-mask">••••••</span>
              {revealBtn(key, 'lock')}
              <button
                type="button"
                className="cr-ib cr-s"
                data-act="info"
                data-key={key}
                aria-label="About this field"
                onClick={() => toast(`${label(key)}: masked. Preview or Reveal needs an OTP from ${mgrName}.`)}
              >
                <Ic n="info" s={13} />
              </button>
            </span>
            {srow}
          </>
        );
      }
    } else if (col.k === 'cert') {
      const proofPending = S.id === 'reg' && !v && Boolean(row.cells.number?.v);
      inner =
        v && cell?.doc ? (
          <button type="button" className="cr-link" data-act="cert" onClick={() => openCert(v, cell.doc!)}>
            <Ic n="paperclip" s={12} />
            {v}
          </button>
        ) : v ? (
          <span className="cr-td-x">
            <Ic n="paperclip" s={12} />
            {v}
          </span>
        ) : (
          plain(proofPending ? 'Proof pending' : '')
        );
    } else {
      const shown = S.id === 'reg' && col.key === 'number' && !v ? 'Not registered yet' : v;
      inner = src ? (
        <>
          <span className={tall ? 'cr-pre' : undefined}>{plain(shown)}</span>
          {srow}
        </>
      ) : (
        plain(shown)
      );
    }
    if (ci === labOf(S) && !sec) inner = <span className="cr-lt">{inner}</span>;
    return (
      <td
        className={cls}
        data-edit={key}
        tabIndex={0}
        key={col.key}
        onClick={(e) => {
          if ((e.target as Element).closest('button,select,a')) return;
          onCellActivate(key);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            onCellActivate(key);
          }
        }}
      >
        {inner}
      </td>
    );
  };

  const headCell = (S: WireSheet, ci: number) => {
    const col = S.cols[ci]!;
    const cls = stickyCls(S, ci);
    if (col.hdr) {
      const key = `kyc|h|${col.key}`;
      const can = editable(key);
      if (edit === key)
        return (
          <th scope="col" className={`${cls} cr-editing`} data-edit={key} key={col.key}>
            {editor(key, false)}
          </th>
        );
      return (
        <th
          scope="col"
          className={`${cls}${can ? ' cr-can' : ''}`}
          data-edit={key}
          tabIndex={0}
          key={col.key}
          onClick={() => onCellActivate(key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCellActivate(key);
            }
          }}
        >
          {col.n || 'New director'}
        </th>
      );
    }
    return (
      <th scope="col" className={cls} key={col.key}>
        {col.n}
        {col.s ? <Ic n="lock" s={11} cls="cr-lk" /> : null}
      </th>
    );
  };

  const gutter = (S: WireSheet, ri: number) => {
    const row = S.rows[ri]!;
    if (row.spacer) return <th scope="row" className="cr-g" />;
    const scope = `row:${S.id}|${row.key}`;
    const m = modeOf(scope);
    const id = `${S.id}|${row.key}`;
    const name = S.id === 'kyc' ? scopeLabel(sheets!, data!.ids, scope).split(' · ').slice(1).join(' · ') : row.cells[LABEL_COL]?.v || `Row ${ri + 1}`;
    // The row number is gone (prototype); the countdown shows while a row is open.
    const num = m ? <span className="cr-rn on">{fmtS(until(scope) - now)}</span> : null;
    const pv = rowHasSecret(S, row.key) ? (
      <button
        type="button"
        className={`cr-rb${m ? ' on' : ''}`}
        data-act="row-preview"
        data-key={id}
        aria-label={`${m ? 'Lock row ' : 'Preview row '}${ri + 1} · ${name}`}
        title={m ? 'Lock row' : 'Preview row'}
        onClick={() => (m ? void endScope(scope, { act: 'row-preview', key: id }) : openOtp('preview', scope, { act: 'row-preview', key: id }))}
      >
        <Ic n={m ? 'eye-off' : 'eye'} s={12} />
      </button>
    ) : (
      <span className="cr-rb-x" />
    );
    const edOn = until(scope, ['edit']) > 0;
    const edb = (
      <button
        type="button"
        className={`cr-rb${m === 'Edit' ? ' on' : ''}`}
        data-act="row-edit"
        data-key={id}
        aria-label={`${m === 'Edit' ? 'Lock row ' : 'Edit row '}${ri + 1} · ${name}`}
        title={m === 'Edit' ? 'Lock row' : 'Edit row'}
        onClick={() => (edOn ? void endScope(scope, { act: 'row-edit', key: id }) : openOtp('edit', scope, { act: 'row-edit', key: id }))}
      >
        <Ic n="pencil" s={12} />
      </button>
    );
    return (
      <th scope="row" className="cr-g">
        <span className="cr-gw">
          {num}
          {pv}
          {edb}
        </span>
      </th>
    );
  };

  /* The Login band reads the Address sheet's Registered office row (same source
     as that sheet); only when that row has no street-level parts does it fall
     back to the step-7 free-text line the row's State/PIN were derived from. */
  const bandAddress = (() => {
    const reg = sheets?.address?.rows.find((r) => r.key === 'registered');
    const val = (k: string) => (reg?.cells[k]?.v ?? '').trim();
    const street = ['door', 'building', 'street', 'area', 'landmark', 'city'].map(val).filter(Boolean);
    if (street.length) return [...street, ...['district', 'state', 'pin', 'country'].map(val).filter(Boolean)].join(', ');
    return data?.registeredAddress ?? '';
  })();

  const grid = (S: WireSheet) => {
    const nc = S.cols.length;
    const titles =
      S.id === 'login'
        ? [`${companyName} · Login credentials`, ...(bandAddress ? [`Address: ${bandAddress}`] : [])]
        : S.id === 'kyc'
          ? [companyName]
          : [];
    const em = hasEdit('page') || hasEdit(`tab:${S.id}`);
    const addRowBtn = S.id === 'login' || S.id === 'other';
    const noDirectors = S.id === 'kyc' && S.cols.length <= 1;
    return (
      <>
        {titles.length ? (
          <div className="cr-ttls">
            {titles.map((t, i) => (
              <span className={i ? 'cr-ttl2' : 'cr-ttl1'} key={i}>
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {noDirectors ? (
          <div className="sx-empty cr-empty-kyc">
            <span>No directors yet</span>
            <button type="button" className="sx-btn sm" data-act="add-dir" onClick={() => needEdit('tab:kyc', () => void addRow('kyc'))}>
              <Ic n="plus" s={13} />
              Add director
            </button>
          </div>
        ) : null}
        {/* a scrolling region must take focus so keyboard users can scroll it (WCAG 2.1.1) */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable scroll container, see above */}
        <div className="cr-gridbox" tabIndex={0} role="region" aria-label={`${tabLabel(S.id)} sheet`} ref={gridRef}>
          <table className={`cr-t${S.id === 'kyc' ? ' kyc xl' : ''}${S.id === 'login' ? ' xl' : ''}${em ? ' cr-editmode' : ''}`}>
            <caption className="sr">
              {tabLabel(S.id)} · {S.rows.length} rows{em ? ' · edit mode' : ' · read-only'}
            </caption>
            <thead>
              <tr className="cr-names">
                <th className="cr-g" scope="col" aria-label="Row actions" />
                {S.cols.map((_, i) => headCell(S, i))}
              </tr>
            </thead>
            {S.rows.length === 0 ? (
              <tbody>
                <tr>
                  <td className="cr-empty-td" colSpan={nc + 1}>
                    <div className="sx-empty">
                      <span>No rows yet</span>
                      {addRowBtn ? (
                        <button type="button" className="sx-btn sm" data-act="add-row" onClick={() => needEdit(`tab:${S.id}`, () => void addRow(S.id))}>
                          <Ic n="plus" s={13} />
                          Add row
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {S.rows.map((row, ri) =>
                  row.spacer ? (
                    <tr className="cr-spacer" key={row.key}>
                      {gutter(S, ri)}
                      <td colSpan={nc} />
                    </tr>
                  ) : (
                    <tr
                      key={row.key}
                      className={`${KYC_ROWS.find((p) => p.key === row.key && p.tall) && S.id === 'kyc' ? 'cr-tallrow ' : ''}${modeOf(`row:${S.id}|${row.key}`) ? 'cr-rowon' : ''}`}
                    >
                      {gutter(S, ri)}
                      {S.cols.map((_, ci) => cellTd(S, ri, ci))}
                    </tr>
                  ),
                )}
              </tbody>
            )}
          </table>
        </div>
        {addRowBtn && S.rows.length > 0 ? (
          <div className="cr-addrow">
            <button type="button" className="sx-btn sm" data-act="add-row" onClick={() => needEdit(`tab:${S.id}`, () => void addRow(S.id))}>
              <Ic n="plus" s={13} />
              Add row
            </button>
          </div>
        ) : null}
      </>
    );
  };

  return {
    stickyCls,
    rowHasSecret,
    editor,
    onCellActivate,
    cellTd,
    headCell,
    gutter,
    bandAddress,
    grid,
  };
}

export type SheetGrid = ReturnType<typeof createSheetGrid>;
