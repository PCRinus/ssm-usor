import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import WordSourceView from './source-word-view';

vi.mock('@docx-editor.dev/core/styles/editor.css', () => ({}));
vi.mock('@docx-editor.dev/fonts', () => ({ packagedFonts: () => [] }));

type Match = { blockId: string; start: number; length: number; paragraphIndex: number };

const paragraphs = ['Echipament individual de protectie', 'Manusi', 'Ochelari de protectie'];

const editor = vi.hoisted(() => ({
  resolving: true,
  matches: null as Match[] | null,
}));

const fakeEditor = {
  findMatches: (queries: readonly string[]) =>
    queries.map(
      (query) =>
        editor.matches ??
        paragraphs.flatMap((text, paragraphIndex) =>
          text.includes(query)
            ? [
                {
                  blockId: `p${paragraphIndex}`,
                  start: text.indexOf(query),
                  length: query.length,
                  paragraphIndex,
                },
              ]
            : []
        )
    ),
  scrollToBlock: vi.fn(() => true),
  fontMeasurement: () => ({ measurer: 'fixed', resolving: editor.resolving }),
};
const mounts = { count: 0 };

const hold = vi.hoisted(() => ({
  starts: [] as { viewport: HTMLElement; fontsPending: () => boolean; stop: () => void }[],
}));

vi.mock('./source-word-passage', () => ({
  holdPassage: (viewport: HTMLElement, { fontsPending }: { fontsPending: () => boolean }) => {
    const stop = vi.fn();
    hold.starts.push({ viewport, fontsPending, stop });
    return stop;
  },
}));

vi.mock('@docx-editor.dev/react', async () => {
  const { useEffect } = await import('react');
  return {
    DocxEditor: ({
      onReady,
      children,
    }: {
      onReady?: (editor: unknown) => void;
      children?: ReactNode;
    }) => {
      useEffect(() => {
        mounts.count += 1;
        onReady?.(fakeEditor);
      }, [onReady]);
      return (
        <div data-testid="docx-editor">
          <div className="docx-page" />
          <div className="docx-editor-one-surface__viewport" data-testid="viewport" />
          {children}
        </div>
      );
    },
    useDocxEditor: () => fakeEditor,
    useEditorState: (select: (state: object) => unknown) =>
      select({ isLoading: false, isOpening: false, parseError: null }),
    useHighlights: () => {},
  };
});

const sourceWith = (url: string) =>
  ({
    fileId: '0b8f6a52-4f0e-4d3a-9c1b-7e2d5a6f8c01',
    uploadPath: 'ROYAL HOTEL/6._LEIP.doc',
    fileName: '6._LEIP.doc',
    page: null,
    original: { url: `${url}-original`, mimeType: 'application/msword' },
    derived: {
      url,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    text: 'Manusi',
    pages: null,
    match: null,
    expiresInSeconds: 300,
  }) satisfies ImportSourceResponse;

beforeEach(() => {
  editor.resolving = true;
  editor.matches = null;
  hold.starts.length = 0;
});

afterEach(() => vi.unstubAllGlobals());

describe('the Word viewer', () => {
  it('opens the document from a new link after the old one was refused', async () => {
    const onShown = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.endsWith('expired')
          ? Response.json({ error: 'InvalidJWT' }, { status: 400 })
          : new Response(new Uint8Array([80, 75, 3, 4]))
      )
    );
    const { rerender } = render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=expired')}
        quote="Manusi"
        onNotFound={() => {}}
        onShown={onShown}
      />
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Documentul nu a putut fi deschis aici.'
    );
    await waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));

    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={() => {}}
        onShown={onShown}
      />
    );
    expect(await screen.findByTestId('docx-editor')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(onShown).toHaveBeenCalledTimes(2));
  });

  it('goes on with the download under way when the next passage comes with a new link', async () => {
    let arrive: () => void = () => {};
    const fetched = vi.fn(
      () =>
        new Promise<Response>(
          (resolve) => (arrive = () => resolve(new Response(new Uint8Array([80, 75, 3, 4]))))
        )
    );
    vi.stubGlobal('fetch', fetched);
    const { rerender } = render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=1')}
        quote="Manusi"
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=2')}
        quote="Ochelari de protectie"
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    arrive();

    await waitFor(() => expect(fakeEditor.scrollToBlock).toHaveBeenLastCalledWith('p2'));
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it('keeps the document when the next passage in it comes with a new link, and marks that one', async () => {
    const fetched = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])));
    vi.stubGlobal('fetch', fetched);
    mounts.count = 0;
    const onNotFound = vi.fn();
    const { rerender } = render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=1')}
        quote="Manusi"
        onNotFound={onNotFound}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(fakeEditor.scrollToBlock).toHaveBeenLastCalledWith('p1'));

    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=2')}
        quote="Ochelari de protectie"
        onNotFound={onNotFound}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(fakeEditor.scrollToBlock).toHaveBeenLastCalledWith('p2'));
    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=3')}
        quote="Casca"
        onNotFound={onNotFound}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(onNotFound).toHaveBeenCalledTimes(1));
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(mounts.count).toBe(1);
  });

  it('holds the passage it found in the viewer, asking the editor whether its fonts are in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])))
    );
    editor.matches = [{ blockId: 'p4', start: 0, length: 6, paragraphIndex: 4 }];
    const { rerender, unmount } = render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(hold.starts).toHaveLength(1));
    const [first] = hold.starts;
    expect(first!.viewport).toBe(screen.getByTestId('viewport'));
    expect(first!.fontsPending()).toBe(true);
    editor.resolving = false;
    expect(first!.fontsPending()).toBe(false);

    editor.matches = [{ blockId: 'p9', start: 2, length: 6, paragraphIndex: 9 }];
    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=next')}
        quote="Ochelari"
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(hold.starts).toHaveLength(2));
    expect(first!.stop).toHaveBeenCalledOnce();

    unmount();
    expect(hold.starts[1]!.stop).toHaveBeenCalledOnce();
  });

  it('holds nothing when the passage is not in the document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])))
    );
    editor.matches = [];
    const onNotFound = vi.fn();
    render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={onNotFound}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(onNotFound).toHaveBeenCalled());
    expect(hold.starts).toEqual([]);
  });
});
