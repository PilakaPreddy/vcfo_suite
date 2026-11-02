'use client';

import { useState } from 'react';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import type { MeetingDto } from '@/hooks/use-board-meetings';
import { WithBlanks } from './parts';

/**
 * The notice and agenda on paper, in the NIPL sample layout. `editBody` turns the body
 * paragraphs into text boxes (the lead while drafting, the manager while approving).
 */
export function NoticePreview({
  meeting,
  editBody,
  body,
  onBody,
}: {
  meeting: MeetingDto;
  editBody?: boolean;
  body?: string[];
  onBody?: (next: string[]) => void;
}) {
  const [tab, setTab] = useState<'notice' | 'agenda'>('notice');
  const n = meeting.notice;
  const paragraphs = body ?? n.body;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-3">
        <SpectrumTabs
          label="Page"
          items={[
            { key: 'notice', label: 'Notice' },
            { key: 'agenda', label: 'Agenda' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as 'notice' | 'agenda')}
        />
      </div>
      <div className="bg-surface-sunken p-5">
        <article className="rounded-md border border-line bg-white px-8 py-8 font-serif text-[13.5px] leading-relaxed text-[#16181d]">
          {tab === 'notice' ? (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 mb-1 text-center text-[14px] font-bold tracking-wide">{n.title}</p>
              <p className="m-0">{n.ref}</p>
              <p className="m-0">{n.dated}</p>
              <p className="m-0 mt-1">{n.salutation}</p>
              <p className="m-0 text-center font-bold">{n.subject}</p>
              {paragraphs.map((p, i) =>
                editBody ? (
                  <textarea
                    key={i}
                    aria-label={`Paragraph ${i + 1}`}
                    value={p}
                    rows={Math.max(2, Math.ceil(p.length / 90))}
                    onChange={(e) => onBody?.(paragraphs.map((x, j) => (j === i ? e.target.value : x)))}
                    className="w-full resize-y rounded-sm border border-dashed border-brand bg-brand-soft/30 p-1.5 font-serif text-[13.5px] leading-relaxed outline-none focus:border-solid"
                  />
                ) : (
                  <p key={i} className="m-0 text-justify">
                    {p}
                  </p>
                ),
              )}
              {n.closing.map((c) => (
                <p key={c} className="m-0">
                  {c}
                </p>
              ))}
              <div className="mt-2 flex flex-col">
                <span className="grid h-9 w-44 place-items-center rounded border border-dashed border-line-strong font-sans text-[11px] text-ink-faint">Signature</span>
                {n.signatory.map((s, i) => (
                  <span key={s} className={i === 0 ? 'mt-1 font-bold' : ''}>
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <p className="m-0">{n.toHeading}</p>
                <ol className="m-0 mt-1 pl-6">
                  {n.to.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 mb-1 text-center text-[14px] font-bold">{n.agendaTitle}</p>
              <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                {n.agendaMeta.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-bold">{k}</dt>
                    <dd className="m-0">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="m-0 mt-2">{n.agendaIntro}</p>
              <ol className="m-0 flex list-none flex-col gap-1 pl-0">
                {n.agenda.map((a) => (
                  <li key={a.n} className="flex flex-col gap-0.5">
                    <span>
                      {a.n}. <WithBlanks text={a.text} />
                    </span>
                    {a.subs.map((s) => (
                      <span key={s.n} className="pl-6">
                        {s.n} <WithBlanks text={s.text} />
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
              <p className="m-0 mt-1 text-center">***</p>
            </div>
          )}
          <footer className="mt-6 border-t border-[#d9dde3] pt-2.5 text-center text-[10.5px] leading-normal text-[#5d6470]">
            {n.footer.map((f, i) => (
              <div key={f} className={i === 0 ? 'font-bold text-[#16181d]' : ''}>
                {f}
              </div>
            ))}
          </footer>
        </article>
      </div>
    </div>
  );
}
