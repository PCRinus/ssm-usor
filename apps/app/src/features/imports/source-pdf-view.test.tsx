import { render, screen } from '@testing-library/react';
import { getDocument } from 'pdfjs-dist';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import PdfSourceView from './source-pdf-view';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  TextLayer: vi.fn(),
  getDocument: vi.fn(),
}));

const page = {
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
  render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
};

const document = { numPages: 2, getPage: vi.fn(async () => page) };

// As pdf.js does, destroying a loading task rejects its promise.
function loadingTask(outcome: 'loads' | 'fails') {
  let reject: (error: Error) => void = () => {};
  const promise = new Promise((resolve, rejectWith) => {
    reject = rejectWith;
    if (outcome === 'loads') setTimeout(() => resolve(document), 10);
    else setTimeout(() => rejectWith(new Error('Invalid PDF structure.')), 10);
  });
  return {
    promise,
    destroy: vi.fn(async () => reject(new Error('Worker was destroyed'))),
  };
}

const source = {
  fileId: '0b8f6a52-4f0e-4d3a-9c1b-7e2d5a6f8c01',
  uploadPath: 'Contract prestari SSM 2019.pdf',
  fileName: 'Contract prestari SSM 2019.pdf',
  page: null,
  original: { url: 'https://storage.example/contract.pdf', mimeType: 'application/pdf' },
  derived: null,
  text: null,
  pages: [{ number: 1, text: 'Contract de prestări servicii' }],
  match: null,
  expiresInSeconds: 300,
} satisfies ImportSourceResponse;

afterEach(() => vi.mocked(getDocument).mockReset());

describe('the PDF viewer', () => {
  it('opens the PDF though development mode loads it twice', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('loads') as unknown as ReturnType<typeof getDocument>
    );
    render(
      <StrictMode>
        <PdfSourceView source={source} quote={null} onNotFound={() => {}} />
      </StrictMode>
    );

    expect(await screen.findByText('Pagina 1 din 2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(2);
  });

  it('says so when the PDF cannot be opened', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('fails') as unknown as ReturnType<typeof getDocument>
    );
    render(<PdfSourceView source={source} quote={null} onNotFound={() => {}} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'PDF-ul nu a putut fi deschis aici.'
    );
  });
});
