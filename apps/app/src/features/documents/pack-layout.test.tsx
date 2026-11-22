import type { DocumentSet } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ClientDocument } from './document-labels';
import {
  documentCountLabel,
  folderContentsLabel,
  sectionCaption,
  sectionCountLabel,
  statusCountLabel,
} from './pack-labels';
import { PackLayout } from './pack-layout';
import type { DocumentStatus, Pack, PackRow, PackSection, StatusCounts } from './pack-status';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function row(key: string, status: DocumentStatus): PackRow {
  const title = `Documentul ${key}`;
  if (status === 'missing') return { kind: 'missing', key, title, document: null, status };
  const document = { id: `id-${key}`, typeKey: key, title } as ClientDocument;
  return { kind: 'document', key, title, document, status };
}

function countsOf(statuses: readonly DocumentStatus[]): StatusCounts {
  const counts: StatusCounts = { issued: 0, update: 0, draft: 0, missing: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

function section(
  id: string,
  number: string | null,
  title: string,
  statuses: readonly DocumentStatus[],
  annexes = 0
): PackSection {
  return {
    id,
    number,
    title,
    rows: statuses.map((status, index) => row(`${id}-${index}`, status)),
    counts: countsOf(statuses),
    annexes,
  };
}

function packOf(sections: PackSection[]): Pack {
  return { sections, counts: countsOf(sections.flatMap((each) => each.rows.map((r) => r.status))) };
}

const filled = packOf([
  section('decisions', '1', 'Decizii interne', ['issued', 'update', 'issued', 'draft', 'draft']),
  section('general-training', '2', 'Material de instruire introductiv-generală', [
    'draft',
    'draft',
  ]),
  section('own-instructions', '3', 'Instrucțiuni proprii', ['issued', 'issued'], 2),
  section('training-themes', '4', 'Tematica de instruire', ['draft', 'update']),
  section('tests', '5', 'Test de verificare a cunoștințelor', ['draft', 'missing']),
  section('protective-equipment', '6', 'Lista internă de dotare cu EIP', ['draft']),
  section('event-registers', '7', 'Registrele de evidență a evenimentelor', ['draft', 'draft']),
  section('control-report', '8', 'Referat de control', ['draft']),
  section('risk-assessment', '9', 'Evaluarea riscurilor', ['draft']),
  section('prevention-plan', '10', 'Planul de prevenire și protecție', ['draft']),
  section('employer-briefing', '11', 'Material de informare a angajatorului', ['draft', 'draft']),
  section('control-regulation', '12', 'Regulament intern privind controlul propriu', ['draft']),
]);

const empty = packOf([
  section('decisions', '1', 'Decizii interne', Array(5).fill('missing')),
  section('control-report', '8', 'Referat de control', ['missing']),
]);

async function renderPack({
  pack,
  url = `/clienti/${clientId}/documente-ssm`,
  readOnly = false,
  set = 'occupational_safety',
}: {
  pack: Pack;
  url?: string;
  readOnly?: boolean;
  set?: DocumentSet;
}) {
  function Page() {
    const { section: sectionId } = useSearch({ strict: false });
    return (
      <PackLayout
        set={set}
        clientId={clientId}
        pack={pack}
        sectionId={sectionId}
        readOnly={readOnly}
        actions={<Button data-testid="documents-archive">Descarcă documentația</Button>}
        generate={<Button data-testid="documents-generate">Generează documentația</Button>}
      >
        {(shown) => (
          <ul data-testid="section-rows">
            {shown.rows.map((each) => (
              <li key={each.key}>{each.title}</li>
            ))}
          </ul>
        )}
      </PackLayout>
    );
  }
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/clienti/$clientId/documente-ssm',
    validateSearch: (search: Record<string, unknown>) => ({
      section: typeof search.section === 'string' ? search.section : undefined,
    }),
    component: Page,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  await router.load();
  await screen.findByTestId('pack-layout');
  return router;
}

const folders = () => screen.getAllByTestId('pack-folder');
const folder = (number: string) =>
  folders().find((each) => within(each).getByTestId('section-number').textContent === number)!;
const folderUrl = (section?: string) =>
  `/clienti/${clientId}/documente-ssm${section ? `?section=${section}` : ''}`;
const legend = () =>
  screen.getAllByTestId('pack-legend-item').map((item) => [item.dataset.status, item.textContent]);

describe('the counts', () => {
  it('put "de" before the noun from 20 on, unless the last two digits are below 20', () => {
    expect(
      [1, 2, 19, 20, 22, 100, 101, 119, 120].map((count) => documentCountLabel(count))
    ).toEqual([
      '1 document',
      '2 documente',
      '19 documente',
      '20 de documente',
      '22 de documente',
      '100 de documente',
      '101 documente',
      '119 documente',
      '120 de documente',
    ]);
    expect([1, 12, 20].map((count) => sectionCountLabel(count))).toEqual([
      '1 secțiune',
      '12 secțiuni',
      '20 de secțiuni',
    ]);
  });

  it('name each state in the singular and the plural', () => {
    expect(
      (['issued', 'update', 'draft', 'missing'] as const).flatMap((status) =>
        [0, 1, 4, 21].map((count) => statusCountLabel(status, count))
      )
    ).toEqual([
      '0 emise',
      '1 emis',
      '4 emise',
      '21 de emise',
      '0 de actualizat',
      '1 de actualizat',
      '4 de actualizat',
      '21 de actualizat',
      '0 ciorne',
      '1 ciornă',
      '4 ciorne',
      '21 de ciorne',
      '0 negenerate',
      '1 negenerat',
      '4 negenerate',
      '21 de negenerate',
    ]);
  });

  it('caption a section by how many are issued, then what needs work', () => {
    const captions = filled.sections.map((each) =>
      sectionCaption(each).map((part) => `${part.text}${part.tone === 'warning' ? '!' : ''}`)
    );
    expect(captions.slice(0, 6)).toEqual([
      ['2 din 5 emise', '1 de actualizat!'],
      ['0 din 2 emise'],
      ['Toate emise'],
      ['0 din 2 emise', '1 de actualizat!'],
      ['0 din 2 emise', '1 negenerat'],
      ['Ciornă'],
    ]);
    expect(
      (['issued', 'update', 'missing'] as const).map((status) =>
        sectionCaption(section('one', '8', 'Referat de control', [status]))
      )
    ).toEqual([
      [{ text: 'Emis', tone: 'plain' }],
      [{ text: 'De actualizat', tone: 'warning' }],
      [{ text: 'Negenerat', tone: 'plain' }],
    ]);
    expect(sectionCaption(section('tests', '5', 'Teste', ['missing', 'missing']))).toEqual([
      { text: 'Negenerate', tone: 'plain' },
    ]);
  });

  it('count the documents of a folder, and the annexes where it has any', () => {
    expect(filled.sections.slice(0, 3).map(folderContentsLabel)).toEqual([
      '5 documente',
      '2 documente',
      '2 documente · 2 anexe',
    ]);
    expect(folderContentsLabel(section('control-report', '8', 'Referat', ['draft']))).toBe(
      '1 document'
    );
  });
});

describe('PackLayout', () => {
  it('shows the bar and the legend over the whole pack, with the states it has', async () => {
    await renderPack({ pack: filled });

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      '4 emise, 2 de actualizat, 15 ciorne, 1 negenerat, din 22 de documente'
    );
    expect(
      within(screen.getByTestId('pack-bar'))
        .getAllByTestId('pack-bar-segment')
        .map((segment) => [segment.dataset.status, segment.style.flexGrow])
    ).toEqual([
      ['issued', '4'],
      ['update', '2'],
      ['draft', '15'],
      ['missing', '1'],
    ]);
    expect(legend()).toEqual([
      ['issued', '4 emise'],
      ['update', '2 de actualizat'],
      ['draft', '15 ciorne'],
      ['missing', '1 negenerat'],
    ]);
    expect(screen.getByTestId('pack-total').textContent).toBe('22 de documente în 12 secțiuni');
    expect(screen.getByTestId('documents-archive')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Documentația/ })).toBeNull();
  });

  it('keeps issued and drafts in the legend at zero, and leaves out the others', async () => {
    await renderPack({
      pack: packOf([section('control-report', '8', 'Referat de control', ['issued'])]),
    });

    expect(legend()).toEqual([
      ['issued', '1 emis'],
      ['draft', '0 ciorne'],
    ]);
    expect(screen.getByTestId('pack-total').textContent).toBe('1 document în 1 secțiune');
  });

  it('opens on a folder per section, one document or many, each a link to it', async () => {
    await renderPack({ pack: filled });

    expect(screen.getByRole('list', { name: 'Secțiunile documentației' })).toBeTruthy();
    expect(folders()).toHaveLength(12);
    expect(screen.queryByTestId('pack-section')).toBeNull();
    expect(screen.queryByTestId('section-rows')).toBeNull();
    expect(folder('3').getAttribute('href')).toBe(folderUrl('own-instructions'));
    expect(within(folder('3')).getByTestId('pack-folder-contents').textContent).toBe(
      '2 documente · 2 anexe'
    );
    expect(within(folder('8')).getByTestId('pack-folder-contents').textContent).toBe('1 document');
    expect(within(folder('8')).getByTestId('pack-section-caption').textContent).toBe('Ciornă');
    expect(within(folder('1')).getByTestId('pack-section-caption').textContent).toBe(
      '2 din 5 emise1 de actualizat'
    );
  });

  it('opens a folder in a history entry of its own, without the set-wide bar and buttons', async () => {
    const router = await renderPack({ pack: filled });

    await userEvent.click(folder('3'));

    expect((await screen.findByTestId('pack-section-title')).textContent).toBe(
      'Instrucțiuni proprii'
    );
    expect(router.state.location.search).toEqual({ section: 'own-instructions' });
    expect(router.history.length).toBe(2);
    expect(within(screen.getByTestId('section-rows')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('pack-header')).toBeNull();
    expect(screen.queryByTestId('pack-folders')).toBeNull();
    expect(screen.queryByTestId('documents-archive')).toBeNull();
    expect(screen.queryByTestId('documents-generate')).toBeNull();
    expect(screen.getByTestId('pack-section-position').textContent).toBe('Secțiunea 3 din 12');

    router.history.back();

    expect(await screen.findAllByTestId('pack-folder')).toHaveLength(12);
    expect(router.state.location.search).toEqual({});
  });

  it('steps to the sections on either side in the same history entry, and back to all of them', async () => {
    const router = await renderPack({ pack: filled, url: folderUrl('own-instructions') });

    const previous = screen.getByTestId('pack-step-previous');
    expect(previous.getAttribute('aria-label')).toBe(
      'Secțiunea anterioară: 2. Material de instruire introductiv-generală'
    );
    expect(previous.getAttribute('href')).toBe(folderUrl('general-training'));
    expect(
      screen.getByRole('link', { name: 'Secțiunea următoare: 4. Tematica de instruire' })
    ).toBeTruthy();
    const next = screen.getByTestId('pack-next-section');
    expect(next.textContent).toBe('Următoarea secțiune: 4. Tematica de instruire');
    expect(next.dataset.slot).toBe('button');

    await userEvent.click(previous);
    expect((await screen.findByTestId('pack-section-title')).textContent).toBe(
      'Material de instruire introductiv-generală'
    );
    await userEvent.click(screen.getByTestId('pack-next-section'));
    await screen.findByText('Instrucțiuni proprii', { selector: 'h2' });
    expect(router.history.length).toBe(1);

    const all = screen.getByTestId('pack-all-sections');
    expect(all.textContent).toBe('Toate secțiunile');
    expect(all.getAttribute('href')).toBe(folderUrl());
    await userEvent.click(all);

    expect(await screen.findAllByTestId('pack-folder')).toHaveLength(12);
    expect(router.state.location.search).toEqual({});
  });

  it('has no section before the first or after the last', async () => {
    await renderPack({ pack: filled, url: folderUrl('decisions') });

    expect(screen.queryByTestId('pack-step-previous')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Secțiunea anterioară' }) as HTMLButtonElement).disabled
    ).toBe(true);

    await userEvent.click(screen.getByTestId('pack-all-sections'));
    await userEvent.click(await waitFor(() => folder('12')));

    await screen.findByText('Regulament intern privind controlul propriu', { selector: 'h2' });
    expect(screen.queryByTestId('pack-next-section')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Secțiunea următoare' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('names a section without a number by its title alone', async () => {
    await renderPack({
      pack: packOf([
        section('decisions', '1', 'Decizii interne', ['draft']),
        section('other', null, 'Alte documente SSM', ['draft']),
      ]),
      url: folderUrl('decisions'),
    });

    expect(screen.getByTestId('pack-next-section').textContent).toBe(
      'Următoarea secțiune: Alte documente SSM'
    );
  });

  it('shows all the folders when the section the URL names is not in the pack', async () => {
    await renderPack({ pack: filled, url: folderUrl('signing-regulation-annex') });

    expect(folders()).toHaveLength(12);
    expect(screen.queryByTestId('pack-section')).toBeNull();
  });

  it('shows what the pack will hold as its folders, under the way to generate it', async () => {
    await renderPack({ pack: empty });

    expect(screen.queryByTestId('pack-header')).toBeNull();
    expect(screen.queryByTestId('pack-bar')).toBeNull();
    expect(
      folders().map((each) => within(each).getByTestId('pack-section-caption').textContent)
    ).toEqual(['Negenerate', 'Negenerat']);
    const panel = screen.getByTestId('pack-empty-panel');
    expect(within(panel).getByRole('heading').textContent).toBe(
      'Documentația SSM nu este generată încă'
    );
    expect(within(panel).getByTestId('documents-hint').textContent).toMatch(
      /^Generează documentația ca să obții .*\. Dosarele de mai jos arată ce va cuprinde: 6 documente în 2 secțiuni\.$/
    );
    expect(within(panel).getByTestId('documents-generate')).toBeTruthy();
    expect(screen.queryByTestId('pack-section')).toBeNull();
  });

  it('opens a folder of a pack not generated yet, with what it will hold', async () => {
    await renderPack({ pack: empty });

    await userEvent.click(folder('1'));

    expect((await screen.findByTestId('pack-section-title')).textContent).toBe('Decizii interne');
    expect(within(screen.getByTestId('section-rows')).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByTestId('pack-empty-panel')).toBeNull();
  });

  it('tells an archived client why nothing is generated, without the button', async () => {
    await renderPack({ pack: empty, readOnly: true, set: 'fire_safety' });

    const panel = screen.getByTestId('pack-empty-panel');
    expect(within(panel).getByRole('heading').textContent).toBe(
      'Documentația SU nu este generată încă'
    );
    expect(within(panel).getByTestId('documents-hint').textContent).toBe(
      'Clientul este arhivat, așa că nu i se mai generează documente.'
    );
    expect(within(panel).queryByTestId('documents-generate')).toBeNull();
    expect(screen.queryByTestId('pack-folders')).toBeNull();
  });

  it('keeps an archived client with nothing generated on its panel, whatever section the URL names', async () => {
    await renderPack({ pack: empty, readOnly: true, url: folderUrl('decisions') });

    expect(screen.getByTestId('pack-empty-panel')).toBeTruthy();
    expect(screen.queryByTestId('pack-section')).toBeNull();
  });

  it('moves the focus to the heading of an opened folder, and back to its tile on the way out', async () => {
    const user = userEvent.setup();
    await renderPack({ pack: filled });

    folder('3').focus();
    await user.keyboard('{Enter}');
    const heading = await screen.findByTestId('pack-section-title');
    await waitFor(() => expect(document.activeElement).toBe(heading));

    await user.click(screen.getByTestId('pack-step-next'));
    await screen.findByText('Tematica de instruire', { selector: 'h2' });
    expect(document.activeElement).toBe(screen.getByTestId('pack-step-next'));

    await user.click(screen.getByTestId('pack-all-sections'));
    await screen.findAllByTestId('pack-folder');
    await waitFor(() => expect(document.activeElement).toBe(folder('4')));
  });

  it('keeps the page where it opens on a folder the URL names', async () => {
    await renderPack({ pack: filled, url: folderUrl('own-instructions') });

    expect(document.activeElement).toBe(document.body);
  });

  it('moves the focus to the heading when the arrow used becomes disabled', async () => {
    const user = userEvent.setup();
    await renderPack({ pack: filled, url: folderUrl('general-training') });

    await user.click(screen.getByTestId('pack-step-previous'));
    const heading = await screen.findByText('Decizii interne', { selector: 'h2' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
