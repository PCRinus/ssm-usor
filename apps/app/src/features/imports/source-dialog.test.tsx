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

vi.mock('@/features/imports/source-word-view', () => ({
  default: ({ onNotFound }: { onNotFound: () => void }) => (
    <button type="button" data-testid="word-view" onClick={onNotFound}>
      Word
    </button>
  ),
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
  match?: { page: number | null; start: number; end: number } | null;
};

const phoneSources = [
  { file: 'Contract prestari SSM 2019.pdf', quote: 'Telefon: 0269 214 377' },
  { file: 'Scanari/Decizie PSI.pdf (pagina 1)', quote: 'tel. 0269 214 377' },
  { file: 'IMG_2041.jpg', quote: '0269 214 377' },
  { file: 'dosar-ssm.zip/Decizie 1.docx', quote: '0269 214 377' },
];

let sourceRequests: number;

function mockSources(
  answers: Record<string, SourceAnswer | 'missing'>,
  sources: { file: string; quote: string }[] = phoneSources
) {
  sourceRequests = 0;
  const proposal = proposalFixture();
  proposal.client.contactPhone.options[0]!.sources = sources;
  mockApi((_init, url) => {
    if (url.pathname === `/imports/${importId}`) {
      return Response.json({ import: readyDetail({ proposal }) });
    }
    if (url.pathname === `/imports/${importId}/source`) {
      const file = url.searchParams.get('file')!;
      const answer = answers[file];
      sourceRequests += 1;
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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the source dialog', () => {
  it('steps through every passage, and says when a PDF passage was not found', async () => {
    mockSources({
      'Contract prestari SSM 2019.pdf': { mimeType: 'application/pdf', match: null },
      'Scanari/Decizie PSI.pdf (pagina 1)': { mimeType: 'application/pdf', page: 1 },
      'IMG_2041.jpg': { mimeType: 'image/jpeg' },
      'dosar-ssm.zip/Decizie 1.docx': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        match: { page: null, start: 0, end: 12 },
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
    expect(within(dialog).getByTestId('source-not-found').textContent).toContain(
      'Nu am găsit pasajul în document'
    );
    expect((within(dialog).getByTestId('source-next') as HTMLButtonElement).disabled).toBe(true);
    expect(
      requestsTo(`/imports/${importId}/source`).map(([input]) =>
        new URL(String(input)).searchParams.get('quote')
      )
    ).toEqual(['Telefon: 0269 214 377', 'tel. 0269 214 377', '0269 214 377', '0269 214 377']);
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

  it('says so when the file cannot be opened', async () => {
    mockSources({ 'Contract prestari SSM 2019.pdf': 'missing' });
    const dialog = await openPhoneSource();
    expect((await within(dialog).findByTestId('source-error')).textContent).toContain(
      'Fișierul nu mai este în import.'
    );
  });
});
