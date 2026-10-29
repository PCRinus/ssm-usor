import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  fetchMock,
  importId,
  mockApi,
  proposalFixture,
  readyDetail,
  requestsTo,
} from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const wordLinks: string[] = [];
const viewers = {
  draw: true,
  progress: null as { loaded: number; total: number } | null,
};

vi.mock('@/features/imports/source-word-view', async () => {
  const { useEffect } = await import('react');
  return {
    default: function WordView({
      source,
      onNotFound,
      onShown,
    }: {
      source: { original: { url: string } };
      onNotFound: () => void;
      onShown: () => void;
    }) {
      wordLinks.push(source.original.url);
      useEffect(() => {
        if (viewers.draw) onShown();
      }, [onShown]);
      return (
        <>
          <button type="button" data-testid="word-view" onClick={onNotFound}>
            Word
          </button>
          <button type="button" data-testid="word-drawn" onClick={onShown}>
            Desenat
          </button>
        </>
      );
    },
  };
});

const pdfMounts = { count: 0 };

vi.mock('@/features/imports/source-pdf-view', async () => {
  const { useEffect } = await import('react');
  return {
    default: function PdfView({
      quote,
      onShown,
      onProgress,
    }: {
      quote: string | null;
      onShown: () => void;
      onProgress: (loaded: number, total: number) => void;
    }) {
      useEffect(() => {
        pdfMounts.count += 1;
      }, []);
      useEffect(() => {
        if (viewers.progress) onProgress(viewers.progress.loaded, viewers.progress.total);
        if (viewers.draw) onShown();
      }, [onShown, onProgress]);
      return <div data-testid="pdf-view" data-quote={quote ?? ''} />;
    },
  };
});

type SourceAnswer = {
  mimeType: string;
  page?: number | null;
  match?: {
    page: number | null;
    start: number;
    end: number;
    parts: { start: number; end: number }[];
  } | null;
  expiresInSeconds?: number;
};

const phoneSources = [
  { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
  { file: 'Scanari/Decizie PSI.pdf (pagina 1)', quote: 'tel. 0269 214 377' },
  { file: 'IMG_2041.jpg', quote: '0269 214 377' },
  { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
];

let sourceRequests: number;
let sourceGate: Promise<unknown> | null;
const quoteGates = new Map<string, Promise<unknown>>();
let sourceNears: (string | null)[];
let sourceQuotes: string[];

function mockSources(
  answers: Record<string, SourceAnswer | 'missing'>,
  sources: { file: string; quote: string }[] = phoneSources,
  proposal: ReturnType<typeof proposalFixture> = proposalFixture()
) {
  sourceRequests = 0;
  sourceNears = [];
  sourceQuotes = [];
  proposal.client.contactPhone.options[0]!.sources = sources;
  mockApi((_init, url) => {
    if (url.pathname === `/imports/${importId}`) {
      return Response.json({ import: readyDetail({ proposal }) });
    }
    if (url.pathname === `/imports/${importId}/source`) {
      const file = url.searchParams.get('file')!;
      const answer = answers[file];
      sourceRequests += 1;
      sourceNears.push(url.searchParams.get('near'));
      sourceQuotes.push(url.searchParams.get('quote')!);
      if (!answer || answer === 'missing') {
        return Response.json({ error: 'not_found', message: 'No such file.' }, { status: 404 });
      }
      const reply = Response.json({
        fileId: '0b8f6a52-4f0e-4d3a-9c1b-7e2d5a6f8c01',
        uploadPath: file,
        fileName: file
          .replace(/ \(pagina \d+\)$/, '')
          .split('/')
          .at(-1),
        page: answer.page ?? null,
        original: {
          url: `https://storage.example/object?token=${sourceRequests}`,
          mimeType: answer.mimeType,
        },
        derived: null,
        text: null,
        pages: null,
        match: answer.match ?? null,
        expiresInSeconds: answer.expiresInSeconds ?? 300,
      });
      const gate = sourceGate ?? quoteGates.get(url.searchParams.get('quote')!);
      return gate ? gate.then(() => reply) : reply;
    }
    return undefined;
  });
}

let mounted: ReturnType<typeof mountApp>;

async function openPhoneSource() {
  mounted = mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/identity`);
  const groups = await screen.findAllByTestId('review-group');
  const contact = groups.find((group) => group.textContent?.includes('Persoană de contact'))!;
  const row = within(contact)
    .getAllByTestId('review-row')
    .find((each) => each.textContent?.includes('Telefon'))!;
  await userEvent.click(within(row).getByTestId('review-source'));
  return screen.findByTestId('import-source-dialog');
}

async function openItemSource(section: string, name: string) {
  mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/${section}`);
  const items = await screen.findAllByTestId('review-item');
  const item = items.find((each) => each.textContent?.includes(name))!;
  await userEvent.click(within(item).getByTestId('review-source'));
  return screen.findByTestId('import-source-dialog');
}

const word = {
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  match: { page: null, start: 0, end: 4, parts: [{ start: 0, end: 4 }] },
};

beforeEach(() => {
  wordLinks.length = 0;
  viewers.draw = true;
  viewers.progress = null;
  sourceGate = null;
  quoteGates.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the source dialog', () => {
  it('counts passages from one file in the singular', async () => {
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': word }, [
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Telefon: 0269 214 377' },
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'tel. 0269 214 377' },
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();

    expect(within(dialog).getByTestId('source-position').textContent).toBe(
      '1 din 3, într-un fișier'
    );
    expect(sourceNears).toEqual([null]);
  });

  it('steps through every passage, and says when a PDF passage was not found', async () => {
    mockSources({
      'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf', match: null },
      'Scanari/Decizie PSI.pdf (pagina 1)': { mimeType: 'application/pdf', page: 1 },
      'IMG_2041.jpg': { mimeType: 'image/jpeg' },
      'dosar-ssm.zip/Decizie 1.docx': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        match: { page: null, start: 0, end: 12, parts: [{ start: 0, end: 12 }] },
      },
    });
    const dialog = await openPhoneSource();

    expect(within(dialog).getByRole('heading').textContent).toBe('Sursa: Telefon');
    expect(within(dialog).getByTestId('source-position').textContent).toBe('1 din 4, în 4 fișiere');
    expect((await within(dialog).findByTestId('pdf-view')).dataset.quote).toBe(
      'Telefon: 0269 214 377'
    );
    expect(within(dialog).getByTestId('source-not-found').textContent).toContain(
      'Nu am găsit pasajul în fișier'
    );
    expect((within(dialog).getByTestId('source-previous') as HTMLButtonElement).disabled).toBe(
      true
    );

    await userEvent.click(within(dialog).getByTestId('source-next'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('source-position').textContent).toMatch(/^2 din 4/)
    );
    expect((await within(dialog).findByTestId('pdf-view')).dataset.quote).toBe('');
    expect(within(dialog).getByTestId('source-read').textContent).toContain('tel. 0269 214 377');
    expect(within(dialog).queryByTestId('source-not-found')).toBeNull();
    expect(dialog.textContent).toContain('Scanare');
    expect(dialog.textContent).toContain('Pagina 1');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    const image = await within(dialog).findByTestId('source-image');
    expect(within(image).getByRole('img').getAttribute('src')).toMatch(
      /^https:\/\/storage\.example\/object\?token=\d+$/
    );
    expect(within(dialog).getByTestId('source-zoom').textContent).toBe('Potrivit');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mărește' }));
    expect(within(dialog).getByTestId('source-zoom').textContent).toBe('150%');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Potrivește în fereastră' }));
    expect(within(dialog).getByTestId('source-zoom').textContent).toBe('Potrivit');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    await userEvent.click(await within(dialog).findByTestId('word-view'));
    expect(within(dialog).getByTestId('source-not-found').textContent).toBe(
      'Pasajul e în acest fișier, dar nu l-am putut marca pe pagină. Am citit: 0269 214 377'
    );
    expect((within(dialog).getByTestId('source-next') as HTMLButtonElement).disabled).toBe(true);
    expect(
      requestsTo(`/imports/${importId}/source`).map(([input]) =>
        new URL(String(input)).searchParams.get('quote')
      )
    ).toEqual(['Telefon: 0269 214 377', 'tel. 0269 214 377', '0269 214 377', '0269 214 377']);
  });

  it('says a Word passage the API did not find either is not in the document', async () => {
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': { ...word, match: null } }, [
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('source-not-found')).textContent).toBe(
      'Nu am găsit pasajul în fișier, așa că nu e marcat. Am citit: 0269 214 377'
    );

    await userEvent.click(within(dialog).getByTestId('word-view'));
    expect(within(dialog).getByTestId('source-not-found').textContent).toBe(
      'Nu am găsit pasajul în document, așa că nu e marcat. Am citit: 0269 214 377'
    );
  });

  it('keeps the file open when stepping between its passages, each answer with a new link', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } }, [
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Fax: 0269 214 377' },
    ]);
    pdfMounts.count = 0;
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('pdf-view')).dataset.quote).toBe(
      'Telefon: 0269 214 377'
    );

    await userEvent.click(within(dialog).getByTestId('source-next'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('pdf-view').dataset.quote).toBe('Fax: 0269 214 377')
    );
    await userEvent.click(within(dialog).getByTestId('source-previous'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('pdf-view').dataset.quote).toBe('Telefon: 0269 214 377')
    );
    expect(sourceRequests).toBe(2);
    expect(pdfMounts.count).toBe(1);
  });

  it('asks for a fresh link to download the original, since the first one expires', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } }, [
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
    ]);
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push(this.href);
    });
    const dialog = await openPhoneSource();
    await within(dialog).findByTestId('pdf-view');
    expect(sourceRequests).toBe(1);

    await userEvent.click(within(dialog).getByTestId('source-download'));
    await waitFor(() =>
      expect(clicked).toEqual([
        'https://storage.example/object?token=2&download=Contract%20prestari%20SSM%202019.pdf',
      ])
    );
    expect(within(dialog).getByTestId('pdf-view').dataset.quote).toBe('Telefon: 0269 214 377');
  });

  async function reopenWordSourceAfter(expiresInSeconds: number, minutes: number) {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': { ...word, expiresInSeconds } }, [
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    await within(dialog).findByTestId('word-view');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByTestId('import-source-dialog')).toBeNull());
    wordLinks.length = 0;
    const kept = mounted.queryClient
      .getQueryCache()
      .getAll()
      .find((each) => String(each.queryKey[0]).endsWith('/source'))!.gcTime;

    vi.setSystemTime(Date.now() + minutes * 60_000);
    const contact = screen
      .getAllByTestId('review-group')
      .find((group) => group.textContent?.includes('Persoană de contact'))!;
    const row = within(contact)
      .getAllByTestId('review-row')
      .find((each) => each.textContent?.includes('Telefon'))!;
    await userEvent.click(within(row).getByTestId('review-source'));
    const reopened = await screen.findByTestId('import-source-dialog');
    await within(reopened).findByTestId('word-view');
    return kept;
  }

  it('waits for new links when reopened after the old ones expired', async () => {
    await reopenWordSourceAfter(300, 6);

    expect(sourceRequests).toBe(2);
    expect(new Set(wordLinks)).toEqual(new Set(['https://storage.example/object?token=2']));
  });

  it('keeps the links as long as the server says they last, less a minute', async () => {
    expect(await reopenWordSourceAfter(600, 8)).toBe(9 * 60_000);

    expect(sourceRequests).toBe(1);
    expect(new Set(wordLinks)).toEqual(new Set(['https://storage.example/object?token=1']));
  });

  it('asks for new links sooner when the server says they last less', async () => {
    await reopenWordSourceAfter(120, 1.5);

    expect(sourceRequests).toBe(2);
    expect(new Set(wordLinks)).toEqual(new Set(['https://storage.example/object?token=2']));
  });

  it('asks for the source while the pointer is on Sursa, once, and opens it from that answer', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } });
    mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/identity`);
    const groups = await screen.findAllByTestId('review-group');
    const contact = groups.find((group) => group.textContent?.includes('Persoană de contact'))!;
    const row = within(contact)
      .getAllByTestId('review-row')
      .find((each) => each.textContent?.includes('Telefon'))!;
    const button = within(row).getByTestId('review-source');

    await userEvent.hover(button);
    await waitFor(() => expect(sourceRequests).toBe(1));
    await userEvent.unhover(button);
    await userEvent.hover(button);
    await userEvent.click(button);
    const dialog = await screen.findByTestId('import-source-dialog');
    expect((await within(dialog).findByTestId('pdf-view')).dataset.quote).toBe(
      'Telefon: 0269 214 377'
    );
    expect(sourceQuotes.filter((quote) => quote === 'Telefon: 0269 214 377')).toHaveLength(1);
  });

  it('asks for none of the rows a pointer only crosses', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } });
    mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/identity`);
    const buttons = await screen.findAllByTestId('review-source');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const button of buttons) {
      fireEvent.pointerEnter(button);
      act(() => vi.advanceTimersByTime(60));
      fireEvent.pointerLeave(button);
    }
    act(() => vi.advanceTimersByTime(1000));
    expect(requestsTo(`/imports/${importId}/source`)).toEqual([]);

    fireEvent.pointerEnter(buttons[0]!);
    act(() => vi.advanceTimersByTime(150));
    vi.useRealTimers();
    await waitFor(() => expect(requestsTo(`/imports/${importId}/source`)).toHaveLength(1));
  });

  it('asks on hover with the post a passage is for, as the dialog then does', async () => {
    const proposal = proposalFixture();
    mockSources({ 'dosar-ssm.zip/Fise post.doc': word }, phoneSources, proposal);
    mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/job-positions`);
    const items = await screen.findAllByTestId('review-item');
    const item = items.find((each) => each.textContent?.includes('Brutar'))!;
    const button = within(item).getByTestId('review-source');

    await userEvent.hover(button);
    await waitFor(() => expect(sourceNears).toEqual(['Brutar']));
    await userEvent.click(button);
    await within(await screen.findByTestId('import-source-dialog')).findByTestId('word-view');
    expect(sourceNears).toEqual(['Brutar']);
  });

  it('says so when the file cannot be opened', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': 'missing' });
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('source-error')).textContent).toContain(
      'Fișierul nu mai este în import.'
    );
    expect(within(dialog).queryByTestId('source-loading')).toBeNull();
  });

  it('shows one placeholder from the click until the file is drawn, under a complete header', async () => {
    let answer: () => void = () => {};
    sourceGate = new Promise<void>((resolve) => (answer = resolve));
    viewers.draw = false;
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': word }, [
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    const loading = () => within(dialog).queryByTestId('source-loading');
    const download = () => within(dialog).getByTestId('source-download') as HTMLButtonElement;

    const viewer = within(dialog).getByTestId('source-viewer');
    expect(within(loading()!).getByRole('status').textContent).toBe('Se deschide documentul…');
    expect(viewer.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).getByRole('heading').textContent).toBe('Sursa: Telefon');
    expect(dialog.textContent).toContain('Decizie 1.docx');
    expect(dialog.textContent).toContain('Document Word');
    expect(download().disabled).toBe(true);

    answer();
    const drawn = await within(dialog).findByTestId('word-drawn');
    expect(loading()).toBeTruthy();
    expect(drawn.closest('[inert]')).toBeTruthy();
    expect(download().disabled).toBe(false);

    fireEvent.click(drawn);
    expect(loading()).toBeNull();
    expect(viewer.getAttribute('aria-busy')).toBe('false');
    expect(drawn.closest('[inert]')).toBeNull();
  });

  it('marks the file busy while the next passage in it is on its way', async () => {
    let answer: () => void = () => {};
    quoteGates.set('Fax: 0269 214 377', new Promise<void>((resolve) => (answer = resolve)));
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } }, [
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Fax: 0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    const viewer = within(dialog).getByTestId('source-viewer');
    await within(dialog).findByTestId('pdf-view');
    expect(viewer.getAttribute('aria-busy')).toBe('false');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(within(dialog).getByTestId('source-position').textContent).toMatch(/^2 din 2/);
    expect(within(dialog).getByTestId('pdf-view').dataset.quote).toBe('Telefon: 0269 214 377');
    expect(viewer.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).getByTestId('source-switching').textContent).toBe('Se deschide pasajul…');
    expect(within(dialog).queryByTestId('source-loading')).toBeNull();

    answer();
    await waitFor(() =>
      expect(within(dialog).getByTestId('pdf-view').dataset.quote).toBe('Fax: 0269 214 377')
    );
    expect(viewer.getAttribute('aria-busy')).toBe('false');
    expect(within(dialog).queryByTestId('source-switching')).toBeNull();
  });

  it('asks for the passages on either side once one is shown', async () => {
    mockSources({
      'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' },
      'Scanari/Decizie PSI.pdf (pagina 1)': { mimeType: 'application/pdf', page: 1 },
      'IMG_2041.jpg': { mimeType: 'image/jpeg' },
      'dosar-ssm.zip/Decizie 1.docx': word,
    });
    const dialog = await openPhoneSource();
    await within(dialog).findByTestId('pdf-view');
    await waitFor(() =>
      expect(sourceQuotes).toEqual(['Telefon: 0269 214 377', 'tel. 0269 214 377'])
    );

    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(within(dialog).queryByTestId('source-switching')).toBeNull();
    await waitFor(() =>
      expect(sourceQuotes).toEqual(['Telefon: 0269 214 377', 'tel. 0269 214 377', '0269 214 377'])
    );
  });

  it('keeps a photo on its first link when stepping between its passages', async () => {
    mockSources({ 'IMG_2041.jpg': { mimeType: 'image/jpeg' } }, [
      { file: 'IMG_2041.jpg', quote: 'Telefon: 0269 214 377' },
      { file: 'IMG_2041.jpg', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    const photo = within(await within(dialog).findByTestId('source-image')).getByRole('img');
    fireEvent.load(photo);
    expect(photo.getAttribute('src')).toBe('https://storage.example/object?token=1');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    await waitFor(() => expect(sourceRequests).toBe(2));
    await waitFor(() => expect(within(dialog).queryByTestId('source-switching')).toBeNull());
    expect(within(dialog).getByRole('img')).toBe(photo);
    expect(photo.getAttribute('src')).toBe('https://storage.example/object?token=1');
  });

  it('names a scanned page and what was read on it before the answer comes', async () => {
    sourceGate = new Promise(() => {});
    mockSources(
      { 'Scanari/Decizie PSI.pdf (pagina 2)': { mimeType: 'application/pdf', page: 2 } },
      [{ file: 'Scanari/Decizie PSI.pdf (pagina 2)', quote: 'tel. 0269 214 377' }]
    );
    const dialog = await openPhoneSource();

    expect(
      within(within(dialog).getByTestId('source-loading')).getByRole('status').textContent
    ).toBe('Se deschide scanarea…');
    expect(dialog.textContent).toContain('Decizie PSI.pdf');
    expect(dialog.textContent).toContain('Scanare');
    expect(dialog.textContent).toContain('Pagina 2');
    expect(within(dialog).getByTestId('source-read').textContent).toContain('tel. 0269 214 377');
  });

  it('shows how much of a PDF has come once it takes a while', async () => {
    viewers.draw = false;
    viewers.progress = { loaded: 3.1 * 1024 * 1024, total: 22.6 * 1024 * 1024 };
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } }, [
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    await within(dialog).findByTestId('pdf-view');
    expect(within(dialog).queryByTestId('source-progress')).toBeNull();

    const progress = await within(dialog).findByTestId('source-progress', {}, { timeout: 2000 });
    expect(progress.textContent).toBe('3,1 din 22,6 MB');
    expect(
      within(within(dialog).getByTestId('source-loading')).getByRole('status').contains(progress)
    ).toBe(false);
    expect(within(progress).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('14');
  });

  it('shows a person’s name, then each role’s passage, saying which role it proves', async () => {
    const proposal = proposalFixture();
    Object.assign(proposal.responsiblePersons[0]!, {
      roleSources: {
        workers_representative: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Radu Lazăr' }],
        first_aid: [
          { file: 'Scanari/Decizie PSI.pdf (pagina 2)', quote: 'prim ajutor: Radu Lazăr' },
          { file: 'dosar-ssm.zip/Decizie 3.docx', quote: 'acordarea primului ajutor' },
        ],
      },
    });
    mockSources(
      {
        'dosar-ssm.zip/Decizie 1.docx': word,
        'Scanari/Decizie PSI.pdf (pagina 2)': { mimeType: 'application/pdf', page: 2 },
        'dosar-ssm.zip/Decizie 3.docx': word,
      },
      phoneSources,
      proposal
    );
    const dialog = await openItemSource('responsible', 'Radu Lazăr');
    const heading = () => within(dialog).getByRole('heading').textContent;

    expect(heading()).toBe('Sursa: Radu Lazăr — Reprezentantul lucrătorilor');
    expect(within(dialog).getByTestId('source-position').textContent).toBe('1 din 3, în 3 fișiere');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(heading()).toBe('Sursa: Radu Lazăr — Prim ajutor');
    expect(await within(dialog).findByTestId('source-read')).toBeTruthy();
    expect(dialog.textContent).toContain('Pagina 2');

    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(heading()).toBe('Sursa: Radu Lazăr — Prim ajutor');
    expect(within(dialog).getByTestId('source-position').textContent).toMatch(/^3 din 3/);
  });

  it('shows only the person’s passage for a proposal stored before roles had their own', async () => {
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': word });
    const dialog = await openItemSource('responsible', 'Radu Lazăr');

    expect(within(dialog).getByRole('heading').textContent).toBe('Sursa: Radu Lazăr');
    expect(within(dialog).getByTestId('source-position').textContent).toBe('1 din 1');
  });

  it('shows a post’s passage, then its category’s and its activities’', async () => {
    const proposal = proposalFixture();
    Object.assign(proposal.jobPositions[0]!, {
      fieldSources: {
        staffCategory: [{ file: 'dosar-ssm.zip/Decizie instruire.docx', quote: 'execuție' }],
        activities: [{ file: 'dosar-ssm.zip/Evaluare.docx', quote: 'Frământare și coacere' }],
      },
    });
    mockSources(
      {
        'dosar-ssm.zip/Fise post.doc': word,
        'dosar-ssm.zip/Decizie instruire.docx': word,
        'dosar-ssm.zip/Evaluare.docx': word,
      },
      phoneSources,
      proposal
    );
    const dialog = await openItemSource('job-positions', 'Brutar');
    const heading = () => within(dialog).getByRole('heading').textContent;

    expect(heading()).toBe('Sursa: Brutar');
    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(heading()).toBe('Sursa: Brutar — Categorie de personal');
    await userEvent.click(within(dialog).getByTestId('source-next'));
    expect(heading()).toBe('Sursa: Brutar — Activități desfășurate');
    expect(within(dialog).getByTestId('source-position').textContent).toBe('3 din 3, în 3 fișiere');
    expect(new Set(sourceNears)).toEqual(new Set(['Brutar']));
  });

  it("sends a fire equipment's room as where it stands", async () => {
    const proposal = proposalFixture();
    const pdf = { mimeType: 'application/pdf' };
    mockSources({ 'b.pdf': pdf }, phoneSources, proposal);
    await openItemSource('fire-safety', 'Laborator');
    expect(sourceNears).toEqual(['Laborator']);
  });

  it('sends the workplace of a fire equipment without a room', async () => {
    const pdf = { mimeType: 'application/pdf' };
    const roomless = proposalFixture();
    Object.assign(roomless.fireEquipment[0]!, { room: null });
    mockSources({ 'b.pdf': pdf }, phoneSources, roomless);
    await openItemSource('fire-safety', 'Stingător');
    expect(sourceNears).toEqual(['Sediu']);
  });

  it("sends a protective equipment entry's post as where its row stands", async () => {
    const proposal = proposalFixture();
    (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
      {
        id: 'equipment-entry-1',
        sources: [{ file: 'dosar-ssm.zip/Echipament.docx', quote: 'Mănuși termorezistente' }],
        otherCompanyName: null,
        jobPosition: { name: 'Brutar', id: 'position-1' },
        risk: 'Arsuri',
        item: 'Mănuși termorezistente',
        quantity: 1,
        durationMonths: 12,
        allocation: 'personal_inventory',
      },
    ];
    mockSources({ 'dosar-ssm.zip/Echipament.docx': word }, phoneSources, proposal);
    await openItemSource('equipment', 'Mănuși termorezistente');
    expect(sourceNears).toEqual(['Brutar']);
  });
});
