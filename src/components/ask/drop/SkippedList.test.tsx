import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkippedList } from './SkippedList';

describe('SkippedList', () => {
  it('renders nothing when nothing was left out', () => {
    const { container } = render(<SkippedList skipped={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows every left-out file with its reason and folds a long list', () => {
    const skipped = Array.from({ length: 10 }, (_, i) => ({ path: `Acme/f${i}.xls`, reason: 'Save as .xlsx and drop it again' }));
    render(<SkippedList skipped={skipped} />);
    const box = screen.getByRole('status', { name: 'Files left out' });
    expect(box).toHaveTextContent('10 files were left out');
    expect(box).toHaveTextContent('Acme/f0.xls');
    expect(screen.getAllByText('Save as .xlsx and drop it again')).toHaveLength(10);
    expect(screen.getByText('Show 2 more')).toBeInTheDocument();
  });

  it('can be hidden by the person', () => {
    const onDismiss = vi.fn();
    render(<SkippedList skipped={[{ path: '.DS_Store', reason: 'Hidden or system file' }]} onDismiss={onDismiss} />);
    expect(screen.getByText('One file was left out')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the list of files left out' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
