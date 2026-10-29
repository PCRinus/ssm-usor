import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import WordSourceView from './source-word-view';

vi.mock('@docx-editor.dev/core/styles/editor.css', () => ({}));
vi.mock('@docx-editor.dev/fonts', () => ({ packagedFonts: () => [] }));
vi.mock('@docx-editor.dev/react', () => ({
  DocxEditor: () => <div data-testid="docx-editor" />,
  useHighlights: () => {},
}));

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
});
