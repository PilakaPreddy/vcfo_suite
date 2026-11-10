import { useState } from 'react';
import { usePanel } from './use-panel';
import { Robot, type RobotMood } from './Robot';
import { RunView } from './RunView';
import { TERMINAL } from '../engine/machine';
import { LIVE_BLOCKED_MESSAGE } from '../engine/live';
import type { PanelCommand, PanelState } from '../shared/messages';
import type { CatalogAgent } from '../shared/types';

/** One colour per agent, from the Spectrum palette. */
export const AGENT_COLORS: Record<string, string> = {
  incorporation: 'var(--brand)',
  'post-incorporation': 'var(--teal)',
  registration: 'var(--positive)',
  compliance: 'var(--amber)',
};
const colorFor = (id: string, i: number) => AGENT_COLORS[id] ?? ['var(--brand)', 'var(--teal)', 'var(--positive)', 'var(--amber)'][i % 4]!;

export function App() {
  const { state, send } = usePanel();
  if (!state) {
    return (
      <main className="panel">
        <p className="muted pad">Connecting to VCFO Assist…</p>
      </main>
    );
  }
  const run = state.run;
  return (
    <main className="panel">
      <Header state={state} send={send} />
      {state.notice && (
        <p className="notice" role="alert">
          {state.notice}
        </p>
      )}
      {run ? <RunView state={state} run={run} send={send} agentColor={colorFor(run.agentId, 0)} /> : <Home state={state} send={send} />}
    </main>
  );
}

function Header({ state, send }: { state: PanelState; send: (c: PanelCommand) => void }) {
  const running = state.run && !TERMINAL.has(state.run.state);
  return (
    <header className="head">
      <div className="head-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>
            <strong>VCFO Assist</strong>
            <span className="brand-sub">Agents</span>
          </span>
        </div>
        <button
          type="button"
          className={`conn ${state.suite.connected ? 'on' : 'off'}`}
          onClick={() => send({ cmd: 'refresh' })}
          title={state.suite.connected ? `Connected to ${state.suite.origin}` : state.suite.error ?? 'Not connected'}
        >
          <span className="dot" aria-hidden="true" />
          {state.suite.connected ? 'Connected' : 'Not connected'}
        </button>
      </div>
      <label className="picker">
        <span className="picker-label">Client</span>
        <select
          value={state.engagementId ?? ''}
          disabled={!state.suite.connected || Boolean(running)}
          onChange={(e) => send({ cmd: 'selectEngagement', id: e.target.value })}
        >
          <option value="">{state.suite.connected ? 'Pick a client…' : 'Open VCFO Suite to load clients'}</option>
          {state.engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {!state.suite.connected && state.suite.error && <p className="muted small">{state.suite.error}</p>}
    </header>
  );
}

function Home({ state, send }: { state: PanelState; send: (c: PanelCommand) => void }) {
  const [agentId, setAgentId] = useState<string>(state.catalog.agents[0]?.id ?? '');
  const agent = state.catalog.agents.find((a) => a.id === agentId);
  const portal = state.portal;
  return (
    <>
      <section className="card">
        <h2 className="eyebrow">Agents</h2>
        <div className="grid" role="list">
          {state.catalog.agents.map((a, i) => (
            <AgentTile key={a.id} agent={a} color={colorFor(a.id, i)} selected={a.id === agentId} onSelect={() => setAgentId(a.id)} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="eyebrow">Portal tab</h2>
        {portal.tabId ? (
          <p className="portal-line">
            <span className={`chip ${portal.mock ? 'chip-teal' : 'chip-danger'}`}>{portal.mock ? 'Mock' : 'Live'}</span>
            <span className="mono small">{portal.host}</span>
          </p>
        ) : (
          <p className="muted small">Open the portal form (or the mock portal) in a tab.</p>
        )}
        {portal.tabId && !portal.liveAllowed && (
          <p className="warn small" role="status">
            {LIVE_BLOCKED_MESSAGE}
          </p>
        )}
      </section>

      {agent && (
        <section className="card">
          <h2 className="eyebrow">{agent.name}: sub-agents</h2>
          <ul className="subs">
            {agent.subAgents.map((s) => {
              const ready = Boolean(s.recipeId);
              const r = state.readiness?.engagementId === state.engagementId ? state.readiness : undefined;
              const missing = r?.missing.length ?? 0;
              return (
                <li key={s.id} className="sub">
                  <div className="sub-main">
                    <strong>{s.name}</strong>
                    {!ready ? (
                      <span className="chip chip-muted">Coming soon</span>
                    ) : !state.engagementId ? (
                      <span className="chip chip-muted">Pick a client</span>
                    ) : !r ? (
                      <span className="chip chip-muted">Checking…</span>
                    ) : r.error ? (
                      <span className="chip chip-danger" title={r.error}>
                        Profile not loaded
                      </span>
                    ) : missing === 0 ? (
                      <span className="chip chip-positive">Ready</span>
                    ) : (
                      <button type="button" className="chip chip-warn link" onClick={() => send({ cmd: 'openSuite', stepId: r.missing.find((m) => m.stepId)?.stepId ?? s.stepId })} title={r.missing.map((m) => m.label).join(', ')}>
                        {missing} missing → Fix in Suite
                      </button>
                    )}
                  </div>
                  {ready && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!state.engagementId || !portal.tabId || !portal.liveAllowed}
                      onClick={() => send({ cmd: 'start', agentId: agent.id, subAgentId: s.id })}
                    >
                      Run
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Settings state={state} send={send} />
    </>
  );
}

function AgentTile({ agent, color, selected, onSelect }: { agent: CatalogAgent; color: string; selected: boolean; onSelect: () => void }) {
  const built = agent.subAgents.filter((s) => s.recipeId).length;
  const mood: RobotMood = 'idle';
  return (
    <button type="button" role="listitem" className={`tile ${selected ? 'selected' : ''}`} style={{ ['--agent' as string]: color }} onClick={onSelect} aria-pressed={selected}>
      <Robot color={color} mood={mood} label={`${agent.name} agent`} />
      <span className="tile-name">{agent.name}</span>
      <span className="tile-sub">{built ? `${built} of ${agent.subAgents.length} ready` : 'Coming soon'}</span>
    </button>
  );
}

function Settings({ state, send }: { state: PanelState; send: (c: PanelCommand) => void }) {
  const [text, setText] = useState(state.settings.suiteOrigins.join('\n'));
  return (
    <details className="card settings">
      <summary>Settings</summary>
      <label className="small">
        Suite origins (one per line). The extension reads data only through an open, signed-in tab on one of these.
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className="mono" />
      </label>
      <button type="button" className="btn" onClick={() => send({ cmd: 'setOrigins', origins: text.split(/\s+/).filter(Boolean) })}>
        Save
      </button>
    </details>
  );
}
