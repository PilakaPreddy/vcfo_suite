import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { allSubAgents } from '@/lib/assist-agents/catalog';
import { getItem } from '@/data/checklist';
import { AssistAgentHint } from './AssistAgentHint';
import { assistHintForStep } from './agent-hint';

describe('assistHintForStep', () => {
  it('maps pre-4 to Name reservation in beta', () => {
    const hint = assistHintForStep('pre-4');
    expect(hint?.lead.id).toBe('spice-a');
    expect(hint?.others).toEqual([]);
    expect(hint?.status).toBe('beta');
  });

  it('leads pre-10 with SPICe+ Part B and lists the linked forms', () => {
    const hint = assistHintForStep('pre-10');
    expect(hint?.lead.id).toBe('spice-b');
    expect(hint?.others.map((s) => s.id)).toEqual(['agile-pro-s', 'emoa', 'eaoa', 'inc-9']);
    // Beta as soon as any sub-agent on the step has a recipe; the catalog decides which.
    const pre10 = allSubAgents().filter((s) => s.stepId === 'pre-10');
    expect(hint?.status).toBe(pre10.some((s) => s.status === 'beta') ? 'beta' : 'later');
  });

  it('covers every step the catalog names and nothing else', () => {
    const steps = new Set(allSubAgents().map((s) => s.stepId).filter(Boolean));
    for (const id of steps) {
      expect(getItem(id as string), id as string).toBeTruthy();
      expect(assistHintForStep(id)).not.toBeNull();
    }
    expect(assistHintForStep('pre-1')).toBeNull();
    expect(assistHintForStep(null)).toBeNull();
  });
});

describe('AssistAgentHint', () => {
  it('shows the sub-agent, its status and the side panel line', () => {
    render(<AssistAgentHint stepId="pre-4" />);
    expect(screen.getByText('VCFO Assist can fill Name reservation on the portal')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/Open the VCFO Assist side panel in Chrome next to the portal/)).toBeTruthy();
  });

  it('renders nothing for a step no agent covers', () => {
    const { container } = render(<AssistAgentHint stepId="pre-1" />);
    expect(container.innerHTML).toBe('');
  });
});
