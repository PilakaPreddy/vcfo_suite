import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnswerEnvelope } from '@/data/ask/schema';
import { TrustBadge } from './TrustBadge';

const generated: AnswerEnvelope = { line: 'x', citations: [], actions: [], origin: 'generated', depth: 'normal' };

describe('TrustBadge', () => {
  it('tells a client to check with their lead', () => {
    render(<TrustBadge answer={generated} firmName="SBC" />);
    expect(screen.getByText('AI answer · check with your lead')).toBeTruthy();
  });

  it('tells staff to check the source, not their lead', () => {
    render(<TrustBadge answer={{ ...generated, draft: true }} firmName="SBC" staff />);
    expect(screen.getByText('Not yet reviewed · check the source')).toBeTruthy();
  });
});
