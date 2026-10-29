import { render, screen, waitFor } from '@testing-library/react';
import { getDocument } from 'pdfjs-dist';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportSourceResponse } from '@/api/generated/api';

import PdfSourceView from './source-pdf-view';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  PDFWorker: class {
    destroyed = false;
  },
  TextLayer: vi.fn(),
  getDocument: vi.fn(),
}));

const page = {
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
  render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
};

const document = {
  numPages: 2,
  getPage: vi.fn(async () => page),
  loadingTask: { destroy: vi.fn(async () => {}) },
};

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

function heldTask() {
  let open: () => void = () => {};
  const promise = new Promise((resolve) => (open = () => resolve(document)));
  return { task: { promise, destroy: vi.fn(async () => {}) }, open };
}

const withLink = (url: string, page?: number) => ({
  ...source,
  original: { ...source.original, url },
  ...(page && { match: { page, start: 0, end: 8, parts: [{ start: 0, end: 8 }] } }),
});

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

afterEach(() => {
  vi.mocked(getDocument).mockReset();
  document.getPage.mockClear();
  document.loadingTask.destroy.mockClear();
});

describe('the PDF viewer', () => {
  it('opens the PDF though development mode loads it twice', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('loads') as unknown as ReturnType<typeof getDocument>
    );
    render(
      <StrictMode>
        <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={() => {}} />
      </StrictMode>
    );

    expect(await screen.findByText('Pagina 1 din 2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(2);
  });

  it('keeps the PDF when the next passage in it comes with a new link, and turns to its page', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('loads') as unknown as ReturnType<typeof getDocument>
    );
    const { rerender } = render(
      <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={() => {}} />
    );
    expect(await screen.findByText('Pagina 1 din 2')).toBeTruthy();

    rerender(
      <PdfSourceView
        source={{
          ...source,
          original: { ...source.original, url: 'https://storage.example/contract.pdf?token=2' },
          match: { page: 2, start: 0, end: 8, parts: [{ start: 0, end: 8 }] },
        }}
        quote={null}
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    expect(await screen.findByText('Pagina 2 din 2')).toBeTruthy();
    expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(1);
  });

  it('goes on with the download under way when the next passage comes with a new link', async () => {
    const { task, open } = heldTask();
    vi.mocked(getDocument).mockReturnValue(task as unknown as ReturnType<typeof getDocument>);
    const { rerender } = render(
      <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={() => {}} />
    );
    rerender(
      <PdfSourceView
        source={withLink('https://storage.example/contract.pdf?token=2', 2)}
        quote={null}
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    open();

    expect(await screen.findByText('Pagina 2 din 2')).toBeTruthy();
    expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(1);
    expect(task.destroy).not.toHaveBeenCalled();
  });

  it('opens the PDF from a new link after the old one was refused', async () => {
    vi.mocked(getDocument)
      .mockImplementationOnce(
        () => loadingTask('fails') as unknown as ReturnType<typeof getDocument>
      )
      .mockImplementation(() => loadingTask('loads') as unknown as ReturnType<typeof getDocument>);
    const onShown = vi.fn();
    const { rerender } = render(
      <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={onShown} />
    );
    await screen.findByRole('alert');

    rerender(
      <PdfSourceView
        source={withLink('https://storage.example/contract.pdf?token=2')}
        quote={null}
        onNotFound={() => {}}
        onShown={onShown}
      />
    );
    expect(await screen.findByText('Pagina 1 din 2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      vi.mocked(getDocument).mock.calls.map(([parameters]) => (parameters as { url: string }).url)
    ).toEqual([
      'https://storage.example/contract.pdf',
      'https://storage.example/contract.pdf?token=2',
    ]);
  });

  it('opens the PDF again from the next link once a page of it could not be drawn', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('loads') as unknown as ReturnType<typeof getDocument>
    );
    document.getPage.mockRejectedValueOnce(new Error('Unexpected server response (400)'));
    const { rerender } = render(
      <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={() => {}} />
    );
    await screen.findByRole('alert');
    expect(document.loadingTask.destroy).toHaveBeenCalledTimes(1);

    rerender(
      <PdfSourceView
        source={withLink('https://storage.example/contract.pdf?token=2')}
        quote={null}
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    expect(await screen.findByText('Pagina 1 din 2')).toBeTruthy();
    expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(2);
  });

  it('opens every PDF on one worker', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('loads') as unknown as ReturnType<typeof getDocument>
    );
    const first = render(
      <PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={() => {}} />
    );
    await screen.findByText('Pagina 1 din 2');
    first.unmount();
    render(
      <PdfSourceView
        source={{ ...source, fileId: 'c4a1f0e2-7d3b-4b8e-9f21-6a5c3e8d1b07' }}
        quote={null}
        onNotFound={() => {}}
        onShown={() => {}}
      />
    );
    await waitFor(() => expect(vi.mocked(getDocument)).toHaveBeenCalledTimes(2));

    const workers = vi
      .mocked(getDocument)
      .mock.calls.map(([parameters]) => (parameters as { worker: unknown }).worker);
    expect(workers[0]).toBeTruthy();
    expect(workers[1]).toBe(workers[0]);
    expect(document.loadingTask.destroy).toHaveBeenCalled();
  });

  it('says when its first page is drawn, and how much of the file has come', async () => {
    vi.mocked(getDocument).mockImplementation(() => {
      const task = loadingTask('loads') as unknown as ReturnType<typeof getDocument>;
      setTimeout(() => task.onProgress?.({ loaded: 3_250_000, total: 23_700_000 }), 0);
      return task;
    });
    const onShown = vi.fn();
    const onProgress = vi.fn();
    render(
      <PdfSourceView
        source={source}
        quote={null}
        onNotFound={() => {}}
        onShown={onShown}
        onProgress={onProgress}
      />
    );

    await waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));
    expect(onProgress).toHaveBeenCalledWith(3_250_000, 23_700_000);
  });

  it('says so when the PDF cannot be opened', async () => {
    vi.mocked(getDocument).mockImplementation(
      () => loadingTask('fails') as unknown as ReturnType<typeof getDocument>
    );
    const onShown = vi.fn();
    render(<PdfSourceView source={source} quote={null} onNotFound={() => {}} onShown={onShown} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'PDF-ul nu a putut fi deschis aici.'
    );
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});
