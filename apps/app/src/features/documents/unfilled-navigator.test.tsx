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
  laidOut: true,
  matches: [] as Match[],
  change: null as (() => void) | null,
  highlights: [] as {
    name: string;
    ranges: readonly Match[];
    options: { activeIndex?: number; color?: string };
  }[],
}));

// As the real one does, the editor finds nothing until the document is laid out.
const fakeEditor = {
  findMatches: vi.fn((query: string, options?: { matchCase?: boolean }) =>
    editor.laidOut && query === 'DE COMPLETAT' && options?.matchCase ? editor.matches : []
  ),
  selectMatch: vi.fn(() => ({ ok: true })),
};

// The real editor is three megabytes of layout engine and needs a browser; the flow tests drive it.
vi.mock('@docx-editor.dev/react', () => ({
  useDocxEditor: () => fakeEditor,
  useEditorEvent: (event: string, handler: () => void) => {
    if (event === 'change') editor.change = handler;
  },
  useHighlights: (
    name: string,
    ranges: readonly Match[],
    options: { activeIndex?: number; color?: string }
  ) => {
    editor.highlights.push({ name, ranges, options });
  },
  useDocumentSearch: () => {
    throw new Error('The unfilled marks must not use the shared search.');
  },
}));

const lastHighlight = () => editor.highlights.at(-1);
const button = () => screen.getByTestId('editor-unfilled');

async function edit(matches: Match[]) {
  editor.matches = matches;
  act(() => editor.change?.());
  await act(() => vi.advanceTimersByTimeAsync(200));
}

beforeEach(() => {
  editor.laidOut = true;
  editor.matches = [mark('p1', 4), mark('p7', 0), mark('p9', 20)];
  editor.change = null;
  editor.highlights = [];
  fakeEditor.findMatches.mockClear();
  fakeEditor.selectMatch.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return () => vi.useRealTimers();
});

describe('the unfilled places button', () => {
  it('counts the marks, matching case, once the document is laid out and before any edit', () => {
    editor.laidOut = false;
    const { rerender } = render(<UnfilledNavigator ready={false} />);
    expect(screen.queryByTestId('editor-unfilled')).toBeNull();

    editor.laidOut = true;
    rerender(<UnfilledNavigator ready />);

    expect(button().textContent).toBe('3 locuri de completat· arată');
    expect(fakeEditor.findMatches).toHaveBeenLastCalledWith('DE COMPLETAT', { matchCase: true });
  });

  it('marks them in a highlight set and a colour of its own, apart from the search', () => {
    render(<UnfilledNavigator ready />);

    expect(lastHighlight()).toEqual({
      name: 'unfilled',
      ranges: editor.matches,
      options: expect.objectContaining({ activeIndex: -1, color: 'var(--app-unfilled-mark)' }),
    });
  });

  it('selects the next mark on every click, from the first after the last', async () => {
    render(<UnfilledNavigator ready />);

    await userEvent.click(button());
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(editor.matches[0]);
    expect(button().textContent).toContain('· 1 din 3');
    expect(lastHighlight()?.options.activeIndex).toBe(0);

    await userEvent.click(button());
    await userEvent.click(button());
    await userEvent.click(button());
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(editor.matches[0]);
    expect(button().textContent).toContain('· 1 din 3');
  });

  it('counts again after an edit, and goes on to the mark after the one typed over', async () => {
    render(<UnfilledNavigator ready />);
    await userEvent.click(button());
    await userEvent.click(button());

    await edit([mark('p1', 4), mark('p9', 20)]);
    expect(button().textContent).toBe('2 locuri de completat· arată');
    expect(lastHighlight()?.ranges).toEqual(editor.matches);

    await userEvent.click(button());
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(mark('p9', 20));
  });

  it('goes on to the next mark in the same paragraph once the selected one is typed over', async () => {
    editor.matches = [mark('p3', 5), mark('p3', 24), mark('p8', 0)];
    render(<UnfilledNavigator ready />);
    await userEvent.click(button());

    await edit([mark('p3', 15), mark('p8', 0)]);
    expect(button().textContent).toBe('2 locuri de completat· arată');

    await userEvent.click(button());
    expect(fakeEditor.selectMatch).toHaveBeenLastCalledWith(mark('p3', 15));
    expect(button().textContent).toContain('· 1 din 2');
  });

  it('keeps its place when an edit elsewhere leaves the selected mark where it was', async () => {
    render(<UnfilledNavigator ready />);
    await userEvent.click(button());
    await userEvent.click(button());

    await edit([mark('p1', 9), mark('p7', 0), mark('p9', 20)]);
    expect(button().textContent).toContain('· 2 din 3');
  });

  it('is not shown when nothing is left to fill in', () => {
    editor.matches = [];
    render(<UnfilledNavigator ready />);

    expect(screen.queryByTestId('editor-unfilled')).toBeNull();
  });
});
