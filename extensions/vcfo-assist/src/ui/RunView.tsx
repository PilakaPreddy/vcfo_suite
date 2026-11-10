import { useRef, useState } from 'react';
import { Robot, type RobotMood } from './Robot';
import { STEPS, estimateCostUsd, stepStatus } from './steps';
import { TERMINAL } from '../engine/machine';
import { LIVE_BLOCKED_MESSAGE } from '../engine/live';
import type { PanelCommand, PanelState } from '../shared/messages';
import type { FieldOutcome, Run } from '../shared/types';
import type { UserEvent } from '../engine/runner';

const MAX_PDF_BYTES = 7 * 1024 * 1024;

type Send = (c: PanelCommand) => void;

export function RunView({ state, run, send, agentColor }: { state: PanelState; run: Run; send: Send; agentColor: string }) {
  const terminal = TERMINAL.has(run.state);
  const mood: RobotMood = run.state === 'DONE' ? 'done' : run.state === 'FAILED' || run.state === 'CANCELLED' ? 'blocked' : run.wait ? 'idle' : 'working';
  const event = (e: UserEvent) => send({ cmd: 'event', event: e });
  const agent = state.catalog.agents.find((a) => a.id === run.agentId);
  const sub = agent?.subAgents.find((s) => s.id === run.subAgentId);

  return (
    <>
      <section className="card run-head" style={{ ['--agent' as string]: agentColor }}>
        <Robot color={agentColor} mood={mood} size={64} label={`${agent?.name ?? 'Agent'}: ${mood}`} />
        <div className="run-title">
          <span className="eyebrow">{agent?.name ?? run.agentId}</span>
          <strong>{sub?.name ?? run.subAgentId}</strong>
          <span className="muted small">
            {run.engagementName ?? run.engagementId} · <span className="mono">{run.portalHost}</span>
          </span>
          <span className={`chip state-chip ${terminal ? (run.state === 'DONE' ? 'chip-positive' : 'chip-danger') : 'chip-brand'}`} data-testid="run-state">
            {run.state.replace(/_/g, ' ')}
          </span>
        </div>
      </section>

      <YouDo run={run} send={send} event={event} />

      <section className="card">
        <h2 className="eyebrow">Checklist</h2>
        <ol className="steps">
          {STEPS.map((s) => {
            const st = stepStatus(run, s.state);
            return (
              <li key={s.state} className={`step ${st}`}>
                <span className="step-mark" aria-hidden="true">
                  {st === 'done' ? '✓' : st === 'failed' ? '!' : st === 'current' ? '' : ''}
                </span>
                <span className="step-label">{s.label}</span>
                <span className={`chip ${s.actor === 'you' ? 'chip-teal' : 'chip-brand-soft'}`}>{s.actor === 'you' ? 'You' : 'Agent'}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <Meter run={run} />

      {run.srn && (
        <section className="card srn-card" data-testid="srn">
          <span className="eyebrow">SRN</span>
          <strong className="mono srn">{run.srn}</strong>
          <span className="muted small">{run.state === 'DONE' ? 'Written back to Suite.' : 'Writing back to Suite…'}</span>
        </section>
      )}

      {run.fields.length > 0 && <Fields fields={run.fields} />}

      <ActivityLog run={run} />

      <div className="row pad">
        {terminal ? (
          <button type="button" className="btn btn-primary" onClick={() => send({ cmd: 'reset' })}>
            New run
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => event({ type: 'CANCEL' })}>
            Cancel run
          </button>
        )}
      </div>
    </>
  );
}

function YouDo({ run, send, event }: { run: Run; send: Send; event: (e: UserEvent) => void }) {
  const w = run.wait;
  if (run.state === 'FAILED') {
    return (
      <section className="card you you-danger" role="alert">
        <span className="eyebrow">Stopped</span>
        <p>{w?.kind === 'live_blocked' ? LIVE_BLOCKED_MESSAGE : run.error}</p>
      </section>
    );
  }
  if (run.state === 'DONE' || run.state === 'CANCELLED' || !w) return null;
  switch (w.kind) {
    case 'login':
      return (
        <YouCard title="Log in">
          <p>Log in to the portal yourself: user ID, password, captcha and OTP. The agent never fills them.</p>
          <button type="button" className="btn btn-primary" onClick={() => event({ type: 'LOGGED_IN' })}>
            I have logged in
          </button>
        </YouCard>
      );
    case 'confirm':
      return <ConfirmCard run={run} event={event} />;
    case 'teach':
      return (
        <YouCard title="Show the agent a field">
          <p>
            Click the field for <strong>{w.label}</strong> on the portal page. The agent remembers it and proposes a recipe fix.
          </p>
          <button type="button" className="btn" onClick={() => event({ type: 'SKIP_TEACH' })}>
            Skip: I will fill it myself
          </button>
        </YouCard>
      );
    case 'check_failed':
      return (
        <YouCard title="Fix the errors" tone="warn">
          <p>{w.message}</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => event({ type: 'RETRY' })}>
              Check again
            </button>
            {w.role === 'check' && (
              <button type="button" className="btn" onClick={() => event({ type: 'REFILL' })}>
                Refill the page
              </button>
            )}
          </div>
        </YouCard>
      );
    case 'dsc':
      return (
        <YouCard title="Sign with DSC">
          <p>Open the downloaded PDF, sign it with your DSC, then drop the signed file here. The agent attaches it unchanged.</p>
          <DropZone onFile={(e) => event(e)} />
        </YouCard>
      );
    case 'submit_pay':
      return (
        <YouCard title="Click Submit and Pay yourself">
          <p>The pulsing buttons on the portal are yours. The agent never clicks Submit or Pay. It reads the SRN when it appears.</p>
        </YouCard>
      );
    case 'suite_error':
      return (
        <YouCard title="Suite did not answer" tone="warn">
          <p>{w.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => event({ type: 'RETRY' })}>
            Try again
          </button>
        </YouCard>
      );
    case 'wrong_page':
      return (
        <YouCard title="Open the form page" tone="warn">
          <p>
            This step fills <strong>{w.page}</strong>, but the portal tab shows <span className="mono">{w.path || 'another page'}</span>. Open the form
            page in that tab. Nothing is filled until it is there.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => event({ type: 'RETRY' })}>
            Check again
          </button>
        </YouCard>
      );
    case 'live_blocked':
      return (
        <YouCard title="Live portal blocked" tone="warn">
          <p>{LIVE_BLOCKED_MESSAGE}</p>
        </YouCard>
      );
    default:
      void send;
      return null;
  }
}

function YouCard({ title, tone, children }: { title: string; tone?: 'warn'; children: React.ReactNode }) {
  return (
    <section className={`card you ${tone === 'warn' ? 'you-warn' : ''}`} aria-live="polite" data-testid="you-do">
      <span className="eyebrow">
        <span className="chip chip-teal">You</span> do this
      </span>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ConfirmCard({ run, event }: { run: Run; event: (e: UserEvent) => void }) {
  const rows = run.fields.filter((f) => f.status === 'planned');
  const others = run.fields.filter((f) => f.status !== 'planned');
  return (
    <YouCard title="Check what will be filled">
      <p className="small">The agent writes exactly these values and nothing else. Values stay in this browser.</p>
      <table className="diff">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
            <th scope="col">Found</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.key}>
              <td>{f.label}</td>
              <td className="mono">{f.value}</td>
              <td>
                <span className={`chip ${f.tier === 'T0' ? 'chip-muted' : 'chip-warn'}`} title={f.foundLabel}>
                  {f.tier}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {others.length > 0 && (
        <p className="small muted">
          Not filled by the agent: {others.map((f) => `${f.label} (${f.status === 'missing' ? 'not in Suite' : f.status})`).join('; ')}.
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={() => event({ type: 'CONFIRM_FILL' })} data-testid="confirm-fill">
        Fill page
      </button>
    </YouCard>
  );
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function DropZone({ onFile }: { onFile: (e: Extract<UserEvent, { type: 'PDF_DROPPED' }>) => void }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function take(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return setError('Drop a PDF file.');
    if (file.size > MAX_PDF_BYTES) return setError('The PDF is larger than 7 MB.');
    const buf = await file.arrayBuffer();
    onFile({ type: 'PDF_DROPPED', name: file.name, size: file.size, sha256: await sha256Hex(buf), base64: toBase64(buf) });
  }

  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files[0]);
      }}
    >
      <p>Drop the signed PDF here</p>
      <button type="button" className="btn" onClick={() => input.current?.click()}>
        Choose file
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden data-testid="pdf-input" onChange={(e) => void take(e.target.files?.[0])} />
      {error && <p className="danger small">{error}</p>}
    </div>
  );
}

function Meter({ run }: { run: Run }) {
  const filled = run.fields.filter((f) => f.status === 'filled').length;
  return (
    <section className="card meter" data-testid="meter">
      <div>
        <span className="meter-n">{filled}</span>
        <span className="meter-l">fields filled</span>
      </div>
      <div>
        <span className="meter-n">{run.aiCalls}</span>
        <span className="meter-l">AI calls</span>
      </div>
      <div>
        <span className="meter-n">{run.aiTokens.toLocaleString('en-IN')}</span>
        <span className="meter-l">tokens</span>
      </div>
      <div>
        <span className="meter-n">${estimateCostUsd(run.aiTokens).toFixed(4)}</span>
        <span className="meter-l">cost</span>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<FieldOutcome['status'], string> = {
  pending: 'Pending',
  planned: 'Planned',
  filled: 'Filled',
  refused: 'Refused',
  missing: 'Not in Suite',
  failed: 'Failed',
  user: 'You fill',
};

function Fields({ fields }: { fields: FieldOutcome[] }) {
  return (
    <details className="card" open>
      <summary className="eyebrow">Fields</summary>
      <ul className="fields">
        {fields.map((f) => (
          <li key={f.key} className={`field-row f-${f.status}`}>
            <span>{f.label}</span>
            <span className="row">
              {f.tier && <span className="chip chip-muted">{f.tier}</span>}
              <span className={`chip ${f.status === 'filled' ? 'chip-positive' : f.status === 'refused' || f.status === 'failed' ? 'chip-danger' : 'chip-muted'}`}>
                {STATUS_TEXT[f.status]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ActivityLog({ run }: { run: Run }) {
  const entries = [...run.log].reverse();
  return (
    <details className="card" open>
      <summary className="eyebrow">Activity</summary>
      <ol className="log" data-testid="activity">
        {entries.map((l, i) => (
          <li key={`${l.t}-${i}`} className={`log-${l.kind}`}>
            <time className="mono">{new Date(l.t).toLocaleTimeString('en-IN', { hour12: false })}</time>
            <span>{l.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
