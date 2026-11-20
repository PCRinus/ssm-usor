import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnfilledNavigator } from './unfilled-navigator';

type Match = { blockId: string; start: number; length: number; text: string };

const mark = (blockId: string, start: number): Match => ({
  blockId,
  start,
  length: 12,
  text: 'DE COMPLETAT',
});

const editor = vi.hoisted(() => ({
  matches: [] as Match[],
  change: null as (() => void) | null,
  highlights: [] as { name: string; ranges: readonly Match[]; activeIndex?: number }[],
}));

const fakeEditor = {
  findMatches: vi.fn((query: string, options?: { matchCase?: boolean }) =>
    query === 'DE COMPLETAT' && options?.matchCase ? editor.matches : []
  ),
  selectMatch: vi.fn(() => ({ ok: true })),
};

// The real editor is three megabytes of layout engine and needs a browser; the flow tests drive it.
vi.mock('@docx-editor.dev/react', () => ({
  useDocxEditor: () => fakeEditor,
  useEditorState: (select: (state: object) => unknown) =>
    select({ isLoading: false, isOpening: false }),
  useEditorEvent: (event: string, handler: () => void) => {
    if (event === 'change') editor.change = handler;
  },
  useHighlights: (name: string, ranges: readonly Match[], options?: { activeIndex?: number }) => {
    editor.highlights.push({ name, ranges, activeIndex: options?.activeIndex });
  },
  useDocumentSearch: () => {
    throw new Error('The unfilled marks must not use the shared search.');
  },
}));

const lastHighlight = () => editor.highlights.at(-1);

beforeEach(() => {
  editor.matches = [mark('p1', 4), mark('p7', 0), mark('p9', 20)];
  editor.change = null;
  editor.highlights = [];
  fakeEditor.findMatches.mockClear();
  fakeEditor.selectMatch.mockClear();
});

describe('the unfilled places button', () => {
  it('counts the marks, matching case, as soon as the document is open', () => {
    render(<UnfilledNavigator />);

    expect(screen.getByTestId('editor-unfilled').textContent).toBe('3 locuri de completat· arată');
    expect(fakeEditor.findMatches).toHaveBeenCalledWith('DE COMPLETAT', { matchCase: true });
  });

  it('marks them in a highlight set of its own, apart from the search', () => {
    render(<UnfilledNavigator />);

    expect(lastHighlight()).toEqual({
      name: 'unfilled',
      ranges: editor.matches,
      activeIndex: -1,
    });
  });

  it('selects the next mark on every click, from the first after the last', async () => {
    render(<UnfilledNavigator />);
    const button = screen.getByTestId('editor-unfilled');

    await userEvent.click(button);
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(editor.matches[0]);
    expect(button.textContent).toContain('· 1 din 3');
    expect(lastHighlight()?.activeIndex).toBe(0);

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(editor.matches[0]);
    expect(button.textContent).toContain('· 1 din 3');
  });

  it('counts again after an edit, and goes on from the first once the selected mark is typed over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<UnfilledNavigator />);
      await userEvent.click(screen.getByTestId('editor-unfilled'));

      editor.matches = [mark('p7', 0), mark('p9', 20)];
      act(() => editor.change?.());
      await act(() => vi.advanceTimersByTimeAsync(200));

      const button = screen.getByTestId('editor-unfilled');
      expect(button.textContent).toBe('2 locuri de completat· arată');
      expect(lastHighlight()?.ranges).toEqual(editor.matches);

      await userEvent.click(button);
      expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(mark('p7', 0));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps its place when an edit elsewhere moves the selected mark', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<UnfilledNavigator />);
      const button = screen.getByTestId('editor-unfilled');
      await userEvent.click(button);
      await userEvent.click(button);

      editor.matches = [mark('p1', 4), mark('p7', 6), mark('p9', 20)];
      act(() => editor.change?.());
      await act(() => vi.advanceTimersByTimeAsync(200));

      expect(button.textContent).toContain('· 2 din 3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not shown when nothing is left to fill in', () => {
    editor.matches = [];
    render(<UnfilledNavigator />);

    expect(screen.queryByTestId('editor-unfilled')).toBeNull();
  });
});
