import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AskContextValue } from '../ask-context';

const uploadAskFiles = vi.fn(async (files: Array<{ file: File; path: string }>) => ({
  uploaded: files.map((f, i) => ({ id: `att-${i}`, fileName: f.file.name, path: f.path })),
  failed: [],
}));
vi.mock('@/hooks/ask/ask-api', () => ({ uploadAskFiles: (...a: unknown[]) => uploadAskFiles(...(a as [Array<{ file: File; path: string }>])) }));

const { AskContext } = await import('../ask-context');
const { AskComposer } = await import('../AskComposer');

function renderComposer(over: Partial<AskContextValue> = {}) {
  const value = {
    shell: 'admin',
    busy: false,
    features: {},
    ask: vi.fn(async () => undefined),
    sendDrop: vi.fn(async () => []),
    ...over,
  } as unknown as AskContextValue;
  render(
    <AskContext.Provider value={value}>
      <AskComposer />
    </AskContext.Provider>,
  );
  return value;
}

const pickFiles = (names: string[]) =>
  act(async () => {
    fireEvent.change(screen.getByTestId('ask-attach-input'), { target: { files: names.map((n) => new File(['data'], n)) } });
  });

describe('AskComposer file drop', () => {
  it('lists an .xls file as left out with the reason instead of dropping it silently', async () => {
    renderComposer();
    await pickFiles(['old.xls', 'good.pdf']);
    expect(screen.getByRole('status', { name: 'Files left out' })).toHaveTextContent('Save as .xlsx and drop it again');
    expect(screen.getByText('good.pdf')).toBeInTheDocument();
  });

  it('sends up to five files with the chat message', async () => {
    const value = renderComposer();
    await pickFiles(['a.pdf', 'b.pdf']);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(value.ask).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ['att-0', 'att-1'] })));
    expect(value.sendDrop).not.toHaveBeenCalled();
  });

  it('sends more than five files as a drop', async () => {
    const value = renderComposer();
    await pickFiles(['1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf', '6.pdf']);
    fireEvent.change(screen.getByLabelText('Ask VCFO'), { target: { value: 'fill this in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(value.sendDrop).toHaveBeenCalledOnce());
    expect(vi.mocked(value.sendDrop).mock.calls[0]![0]).toMatchObject({ message: 'fill this in' });
    expect(vi.mocked(value.sendDrop).mock.calls[0]![0].files).toHaveLength(6);
    expect(value.ask).not.toHaveBeenCalled();
  });

  it('offers no file drop to clients', () => {
    renderComposer({ shell: 'client' });
    expect(screen.queryByTestId('ask-attach-input')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach a folder' })).toBeNull();
  });
});
