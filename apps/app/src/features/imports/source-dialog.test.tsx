import { screen, waitFor, within } from '@testing-library/react';
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

vi.mock('@/features/imports/source-word-view', () => ({
  default: ({
    source,
    onNotFound,
  }: {
    source: { original: { url: string } };
    onNotFound: () => void;
  }) => {
    wordLinks.push(source.original.url);
    return (
      <button type="button" data-testid="word-view" onClick={onNotFound}>
        Word
      </button>
    );
  },
}));

vi.mock('@/features/imports/source-pdf-view', async () => {
  const { useState } = await import('react');
  return {
    default: function PdfView({ quote }: { quote: string | null }) {
      const [opened] = useState(quote);
      return <div data-testid="pdf-view" data-quote={quote ?? ''} data-opened={opened ?? ''} />;
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
};

const phoneSources = [
  { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
  { file: 'Scanari/Decizie PSI.pdf (pagina 1)', quote: 'tel. 0269 214 377' },
  { file: 'IMG_2041.jpg', quote: '0269 214 377' },
  { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
];

let sourceRequests: number;
let sourceNears: (string | null)[];

function mockSources(
  answers: Record<string, SourceAnswer | 'missing'>,
  sources: { file: string; quote: string }[] = phoneSources,
  proposal: ReturnType<typeof proposalFixture> = proposalFixture()
) {
  sourceRequests = 0;
  sourceNears = [];
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
      if (!answer || answer === 'missing') {
        return Response.json({ error: 'not_found', message: 'No such file.' }, { status: 404 });
      }
      return Response.json({
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
        expiresInSeconds: 300,
      });
    }
    return undefined;
  });
}

async function openPhoneSource() {
  mountApp(authFixture(makeSession()).client, `/clients/import/${importId}/identity`);
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

  it('opens a passage on its own place when stepping back to it in the same file', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } }, [
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
      { file: 'Contract prestari SSM 2019.pdf', quote: 'Fax: 0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('pdf-view')).dataset.opened).toBe(
      'Telefon: 0269 214 377'
    );

    await userEvent.click(within(dialog).getByTestId('source-next'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('pdf-view').dataset.opened).toBe('Fax: 0269 214 377')
    );
    await userEvent.click(within(dialog).getByTestId('source-previous'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('pdf-view').dataset.opened).toBe('Telefon: 0269 214 377')
    );
  });

  it('asks for a fresh link to download the original, since the first one expires', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf' } });
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

  it('waits for new links when reopened after the old ones expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockSources({ 'dosar-ssm.zip/Decizie 1.docx': word }, [
      { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
    ]);
    const dialog = await openPhoneSource();
    await within(dialog).findByTestId('word-view');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByTestId('import-source-dialog')).toBeNull());
    wordLinks.length = 0;

    vi.setSystemTime(Date.now() + 6 * 60_000);
    const contact = screen
      .getAllByTestId('review-group')
      .find((group) => group.textContent?.includes('Persoană de contact'))!;
    const row = within(contact)
      .getAllByTestId('review-row')
      .find((each) => each.textContent?.includes('Telefon'))!;
    await userEvent.click(within(row).getByTestId('review-source'));
    const reopened = await screen.findByTestId('import-source-dialog');

    await within(reopened).findByTestId('word-view');
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
    expect(sourceRequests).toBe(1);
  });

  it('says so when the file cannot be opened', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': 'missing' });
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('source-error')).textContent).toContain(
      'Fișierul nu mai este în import.'
    );
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
});
