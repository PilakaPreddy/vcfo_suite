import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DocPackRailCard } from '@/components/doc-pack/DocPackRailCard';
import { evaluateDocPack } from '@/lib/doc-pack/evaluate';
import { FINALIZED_BR, director, fullState } from '@/lib/doc-pack/__tests__/fixtures';

describe('DocPackRailCard', () => {
  it('shows the three counts and the pack link', () => {
    const state = fullState([director('e1', 'no', 'Alpha'), director('e2', 'yes', 'Beta', { panNumber: '' })]);
    const summary = evaluateDocPack({ state, brRow: FINALIZED_BR });
    render(<DocPackRailCard summary={summary} loading={false} error={false} packHref="/pack" />);
    expect(screen.getByText(`${summary.counts.ready} ready`)).toBeInTheDocument();
    expect(screen.getByText(`${summary.counts['needs-inputs']} need inputs`)).toBeInTheDocument();
    expect(screen.getByText(`${summary.counts['waiting-release']} waiting`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open document pack/ })).toHaveAttribute('href', '/pack');
  });

  it('keeps the link while readiness loads or fails', () => {
    const { rerender } = render(<DocPackRailCard summary={undefined} loading error={false} packHref="/pack" />);
    expect(screen.getByText('Checking readiness…')).toBeInTheDocument();
    rerender(<DocPackRailCard summary={undefined} loading={false} error packHref="/pack" />);
    expect(screen.getByText('Readiness could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open document pack/ })).toBeInTheDocument();
  });
});
