"use client";
import * as React from "react";
import { ArrowRight, Check, Minus, X } from "lucide-react";
import { COMPARE, COMPARE_COLS, ringItems, type Mark } from "./content";
import { reduceMotion } from "./landing-motion";

/** A 24 px line icon, drawn the way the old landing drew them (stroke 1.75). */
export function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** The hero stage word: typed, held, erased and retyped, one stage after the other. */
export function SwapWord({ words, start }: { words: string[]; start: boolean }) {
  const [text, setText] = React.useState(words[0]);
  React.useEffect(() => {
    if (!start || reduceMotion()) return;
    let wi = 0;
    let cur = words[0];
    let timer: ReturnType<typeof setTimeout>;
    const type = (word: string, i: number) => {
      cur = word.slice(0, i);
      setText(cur);
      if (i >= word.length) return cycle();
      timer = setTimeout(() => type(word, i + 1), 72);
    };
    const erase = () => {
      if (!cur.length) {
        wi = (wi + 1) % words.length;
        timer = setTimeout(() => type(words[wi], 1), 260);
        return;
      }
      cur = cur.slice(0, -1);
      setText(cur);
      timer = setTimeout(erase, 40);
    };
    const cycle = () => {
      timer = setTimeout(erase, 2400);
    };
    cycle();
    return () => clearTimeout(timer);
  }, [words, start]);
  return <span className="swap">{text}</span>;
}

/** Fixed decimals, so the server and the browser print the same coordinates. */
const f2 = (n: number) => n.toFixed(2);

/** The year ring: one track per regulator, a dot for every statutory date, a sweeping hand. */
export function ComplianceRing() {
  const C = 260;
  const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  const R = { gst: 214, it: 192, mca: 170, lab: 148, rbi: 126 } as const;
  const items = ringItems();
  const pos = (m: number, d: number, r: number) => {
    const a = ((m + (d - 1) / 31) / 12) * Math.PI * 2 - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  return (
    <svg id="ring" viewBox="0 0 520 520" role="img" aria-label="A year ring from April to March with dots for every statutory filing: GST, income tax, MCA, labour and RBI.">
      {Object.entries(R).map(([k, r]) => (
        <circle key={k} className="track" cx={C} cy={C} r={r} />
      ))}
      {MONTHS.map((mo, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const am = ((i + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
        return (
          <React.Fragment key={mo}>
            <line className="mline" x1={f2(C + 112 * Math.cos(a))} y1={f2(C + 112 * Math.sin(a))} x2={f2(C + 228 * Math.cos(a))} y2={f2(C + 228 * Math.sin(a))} />
            <text className="month" x={f2(C + 246 * Math.cos(am))} y={f2(C + 246 * Math.sin(am) + 4)}>
              {mo.toUpperCase()}
            </text>
          </React.Fragment>
        );
      })}
      {items.map((it, idx) => {
        const [x, y] = pos(it.m, it.d, R[it.s]);
        const small = it.t.indexOf("GSTR") === 0 || it.t === "TDS payment" || it.s === "lab";
        return (
          <circle key={idx} className={`dot s-${it.s}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={small ? 3.2 : 4.6} style={{ "--i": idx } as React.CSSProperties}>
            <title>{`${it.t}, ${it.d} ${MONTHS[it.m]}`}</title>
          </circle>
        );
      })}
      <g className="hand-g">
        <line className="hand" x1={C} y1={C} x2={C} y2={C - 222} />
        <circle className="hand-cap" cx={C} cy={C - 222} r={3} />
      </g>
      <circle className="ctr" cx={C} cy={C} r={100} />
      <text className="ctr-t" x={C} y={C - 2}>
        FY 2026-27
      </text>
      <text className="ctr-s" x={C} y={C + 20}>
        {items.length} statutory dates
      </text>
    </svg>
  );
}

function CompareMark({ m }: { m: Mark }) {
  if (m === "yes") return <Check className="cmp-yes" size={22} strokeWidth={2.2} role="img" aria-label="Yes" />;
  if (m === "no") return <X className="cmp-no" size={20} strokeWidth={1.8} role="img" aria-label="No" />;
  return (
    <span className="cmp-part">
      <Minus size={18} strokeWidth={1.8} role="img" aria-label="Partly" />
      By hand
    </span>
  );
}

/**
 * Board C2: VCFO Suite against a generic task tool and spreadsheets. On a phone the task-tool column drops out.
 * "Book a demo" opens the landing's Book a demo dialog through `onDemo`.
 */
export function CompareSection({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="cmp" id="compare" aria-labelledby="cmp-t">
      <div className="cmp-in">
        <div className="cmp-head reveal">
          <span className="cmp-kicker">The VCFO way vs. the old way</span>
          <h2 className="cmp-h" id="cmp-t">
            Spreadsheets break when compliance stops being <span>routine.</span>
          </h2>
        </div>
        <div className="cmp-card reveal">
          <table className="cmp-table">
            <caption className="sr">VCFO Suite compared with the old way</caption>
            <colgroup>
              <col className="c-label" />
              <col className="c-vcfo" />
              <col className="c-tool" />
              <col className="c-sheet" />
            </colgroup>
            <thead>
              <tr>
                <td className="cmp-corner" />
                <th scope="col" className="cmp-vh">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a fixed logo at its own size, as on the old landing */}
                  <img src="/landing/vcfo-logo-on-black.webp" alt={COMPARE_COLS[0]} width="1104" height="240" />
                </th>
                <th scope="col" className="cmp-oh c-tool">
                  {COMPARE_COLS[1]}
                </th>
                <th scope="col" className="cmp-oh">
                  {COMPARE_COLS[2]}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="cmp-v">
                    <CompareMark m={r.vcfo} />
                  </td>
                  <td className="c-tool">
                    <CompareMark m={r.tool} />
                  </td>
                  <td>
                    <CompareMark m={r.sheet} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cmp-acts reveal">
          <button className="cmp-btn" type="button" onClick={onDemo}>
            Book a demo <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
          <a className="cmp-link" href="#journey">
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
