import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import WordSourceView from './source-word-view';

vi.mock('@docx-editor.dev/core/styles/editor.css', () => ({}));
vi.mock('@docx-editor.dev/fonts', () => ({ packagedFonts: () => [] }));

type Match = { blockId: string; start: number; length: number; paragraphIndex: number };

const editor = vi.hoisted(() => ({
  resolving: true,
  matches: [] as Match[],
  ready: null as null | (() => void),
}));

const fakeEditor = {
  findMatches: (queries: readonly string[]) => queries.map(() => editor.matches),
  scrollToBlock: () => true,
  fontMeasurement: () => ({ measurer: 'fixed', resolving: editor.resolving }),
};

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
  const { useEffect, useState } = await import('react');
  return {
    DocxEditor: ({
      children,
      onReady,
    }: {
      children: ReactNode;
      onReady: (instance: typeof fakeEditor) => void;
    }) => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        editor.ready = () => onReady(fakeEditor);
      }, [onReady]);
      useEffect(() => {
        editor.ready?.();
        setReady(true);
      }, []);
      return (
        <div data-testid="docx-editor">
          <div className="docx-editor-one-surface__viewport" data-testid="viewport" />
          {ready && children}
        </div>
      );
    },
    useDocxEditor: () => fakeEditor,
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
  editor.matches = [];
  editor.ready = null;
  hold.starts.length = 0;
});

afterEach(() => vi.unstubAllGlobals());

describe('the Word viewer', () => {
  it('opens the document from a new link after the old one was refused', async () => {
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
      />
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Documentul nu a putut fi deschis aici.'
    );

    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={() => {}}
      />
    );
    expect(await screen.findByTestId('docx-editor')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds the passage it found in the viewer, asking the editor whether its fonts are in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])))
    );
    editor.matches = [{ blockId: 'p4', start: 0, length: 6, paragraphIndex: 4 }];
    const { unmount } = render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={() => {}}
      />
    );
    await waitFor(() => expect(hold.starts).toHaveLength(1));
    const [first] = hold.starts;
    expect(first!.viewport).toBe(screen.getByTestId('viewport'));
    expect(first!.fontsPending()).toBe(true);
    editor.resolving = false;
    expect(first!.fontsPending()).toBe(false);

    editor.matches = [{ blockId: 'p9', start: 2, length: 6, paragraphIndex: 9 }];
    act(() => editor.ready!());
    expect(first!.stop).toHaveBeenCalledOnce();
    expect(hold.starts).toHaveLength(2);

    unmount();
    expect(hold.starts[1]!.stop).toHaveBeenCalledOnce();
  });

  it('holds nothing when the passage is not in the document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])))
    );
    const onNotFound = vi.fn();
    render(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=fresh')}
        quote="Manusi"
        onNotFound={onNotFound}
      />
    );
    await waitFor(() => expect(onNotFound).toHaveBeenCalled());
    expect(hold.starts).toEqual([]);
  });
});
