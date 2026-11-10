/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip, FilterChipRow, FilterToggleChip, filterRowLayout, type FilterRowChip } from './filter-chip';

const chip = (key: string, set = false): FilterRowChip => ({ key, set, node: <span>{key}</span> });

describe('filterRowLayout', () => {
  it('shows the first four chips and counts the rest behind More filters', () => {
    const chips = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => chip(k));
    const out = filterRowLayout(chips, 4, false);
    expect(out.shown.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.hiddenCount).toBe(2);
    expect(out.anySet).toBe(false);
  });

  it('always shows a set chip past the limit', () => {
    const chips = [chip('a'), chip('b'), chip('c'), chip('d'), chip('e', true), chip('f')];
    const out = filterRowLayout(chips, 4, false);
    expect(out.shown.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.hiddenCount).toBe(1);
    expect(out.anySet).toBe(true);
  });

  it('shows every chip when opened', () => {
    const chips = ['a', 'b', 'c', 'd', 'e'].map((k) => chip(k));
    expect(filterRowLayout(chips, 4, true).shown).toHaveLength(5);
  });
});

describe('FilterChipRow', () => {
  it('toggles More filters and shows Clear all only when a chip is set', () => {
    const onClear = vi.fn();
    const chips = ['a', 'b', 'c', 'd', 'e'].map((k) => chip(k));
    const { rerender } = render(<FilterChipRow chips={chips} onClear={onClear} />);
    expect(screen.queryByText('e')).toBeNull();
    expect(screen.queryByText('Clear all')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More filters · 1/ }));
    expect(screen.getByText('e')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer filters' })).toHaveAttribute('aria-expanded', 'true');

    rerender(<FilterChipRow chips={[chip('a', true)]} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('FilterChip', () => {
  const options = [
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' },
  ];

  it('draws a plain-edged add chip when unset (R-56)', () => {
    render(<FilterChip label="Status" value="" options={options} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Status' })).toHaveClass('border-line-strong');
    expect(screen.getByRole('button', { name: 'Status' }).className).not.toMatch(/dashed|dotted/);
  });

  it('draws the set chip with the value and clears it with the ×', () => {
    const onChange = vi.fn();
    render(<FilterChip label="Status" value="open" options={options} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Status: Open. Change' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Status filter' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clears to the given none value', () => {
    const onChange = vi.fn();
    render(<FilterChip label="Area" value="gst" none="all" options={[{ value: 'gst', label: 'GST' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Area filter' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('keeps a set-only chip with no options and renders nothing when unset', () => {
    const { container, rerender } = render(<FilterChip label="Day" value="2026-10-19" valueLabel="19 Oct" options={[]} onChange={() => {}} />);
    expect(screen.getByText('19 Oct')).toBeInTheDocument();
    rerender(<FilterChip label="Day" value="" options={[]} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggle chip reports its state', () => {
    const onClick = vi.fn();
    render(<FilterToggleChip on label="Overdue" count={3} onClick={onClick} />);
    const btn = screen.getByRole('button', { name: /Overdue/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
