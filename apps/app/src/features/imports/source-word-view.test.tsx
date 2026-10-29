import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import WordSourceView from './source-word-view';

vi.mock('@docx-editor.dev/core/styles/editor.css', () => ({}));
vi.mock('@docx-editor.dev/fonts', () => ({ packagedFonts: () => [] }));
const paragraphs = ['Echipament individual de protectie', 'Manusi', 'Ochelari de protectie'];
const editor = {
  findMatches: (query: string) =>
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
    ),
  scrollToBlock: vi.fn(),
};
const mounts = { count: 0 };

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
        onReady?.(editor);
      }, [onReady]);
      return (
        <div data-testid="docx-editor">
          <div className="docx-page" />
          {children}
        </div>
      );
    },
    useDocxEditor: () => null,
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
    expect(onShown).toHaveBeenCalledTimes(1);

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

    await waitFor(() => expect(editor.scrollToBlock).toHaveBeenLastCalledWith('p2'));
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
    await waitFor(() => expect(editor.scrollToBlock).toHaveBeenLastCalledWith('p1'));

    rerender(
      <WordSourceView
        source={sourceWith('https://storage.example/leip.docx?token=2')}
        quote="Ochelari de protectie"
        onNotFound={onNotFound}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(editor.scrollToBlock).toHaveBeenLastCalledWith('p2'));
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
});
