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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ClientDocument } from './document-labels';
import {
  documentCountLabel,
  sectionCaption,
  sectionCountLabel,
  statusCountLabel,
} from './pack-labels';
import { PackLayout } from './pack-layout';
import { MissingDocumentRow, PackTable } from './pack-rows';
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
  statuses: readonly DocumentStatus[]
): PackSection {
  return {
    id,
    number,
    title,
    rows: statuses.map((status, index) => row(`${id}-${index}`, status)),
    counts: countsOf(statuses),
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
  section('own-instructions', '3', 'Instrucțiuni proprii', ['issued', 'issued']),
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

function screenWidth(wide: boolean) {
  const media = window.matchMedia;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      ...media(query),
      matches: wide && query === '(min-width: 1280px)',
    }))
  );
}

async function renderPack({
  pack,
  url = `/clients/${clientId}/documents`,
  wide,
  readOnly = false,
  set = 'occupational_safety',
}: {
  pack: Pack;
  url?: string;
  wide: boolean;
  readOnly?: boolean;
  set?: DocumentSet;
}) {
  screenWidth(wide);
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
    path: '/clients/$clientId/documents',
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

const entries = () => screen.getAllByTestId('pack-contents-entry');
const entry = (number: string) =>
  entries().find((each) => within(each).queryByText(number, { selector: 'span' }) !== null)!;
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
  });
});

describe('PackLayout', () => {
  it('shows the bar and the legend over the whole pack, with the states it has', async () => {
    await renderPack({ pack: filled, wide: true });

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
  });

  it('keeps issued and drafts in the legend at zero, and leaves out the others', async () => {
    await renderPack({
      pack: packOf([section('control-report', '8', 'Referat de control', ['issued'])]),
      wide: true,
    });

    expect(legend()).toEqual([
      ['issued', '1 emis'],
      ['draft', '0 ciorne'],
    ]);
    expect(screen.getByTestId('pack-total').textContent).toBe('1 document în 1 secțiune');
  });

  it('on a wide screen opens the first section beside the contents', async () => {
    await renderPack({ pack: filled, wide: true });

    expect(screen.getByRole('navigation', { name: 'Cuprinsul documentației' })).toBeTruthy();
    expect(entries()).toHaveLength(12);
    expect(screen.getByTestId('pack-section-title').textContent).toBe('Decizii interne');
    expect(entries().map((each) => each.getAttribute('aria-current'))).toEqual([
      'true',
      ...Array(11).fill(null),
    ]);
    expect(entry('1').className).toContain('bg-success');
    expect(within(screen.getByTestId('section-rows')).getAllByRole('listitem')).toHaveLength(5);
  });

  it('opens the section the URL names, and another one from the contents', async () => {
    const router = await renderPack({
      pack: filled,
      wide: true,
      url: `/clients/${clientId}/documents?section=own-instructions`,
    });

    expect(screen.getByTestId('pack-section-title').textContent).toBe('Instrucțiuni proprii');
    expect(entry('3').getAttribute('aria-current')).toBe('true');
    expect(entry('1').getAttribute('aria-current')).toBeNull();
    expect(entry('1').className).not.toContain('bg-success');

    await userEvent.click(entry('4'));

    expect((await screen.findByTestId('pack-section-title')).textContent).toBe(
      'Tematica de instruire'
    );
    expect(router.state.location.search).toEqual({ section: 'training-themes' });
    expect(entry('4').getAttribute('aria-current')).toBe('true');
    expect(entry('4').getAttribute('href')).toBe(
      `/clients/${clientId}/documents?section=training-themes`
    );
  });

  it('leads to the next section, and to none after the last', async () => {
    await renderPack({
      pack: filled,
      wide: true,
      url: `/clients/${clientId}/documents?section=risk-assessment`,
    });

    const next = screen.getByTestId('pack-next-section');
    expect(next.textContent).toBe('Secțiunea următoare10. Planul de prevenire și protecție');
    await userEvent.click(next);
    expect((await screen.findByTestId('pack-section-title')).textContent).toBe(
      'Planul de prevenire și protecție'
    );

    await userEvent.click(entry('12'));
    await screen.findByText('Regulament intern privind controlul propriu', { selector: 'h3' });
    expect(screen.queryByTestId('pack-next-section')).toBeNull();
  });

  it('names a section without a number by its title alone', async () => {
    await renderPack({
      pack: packOf([
        section('decisions', '1', 'Decizii interne', ['draft']),
        section('other', null, 'Alte documente SSM', ['draft']),
      ]),
      wide: true,
    });

    expect(screen.getByTestId('pack-next-section').textContent).toBe(
      'Secțiunea următoareAlte documente SSM'
    );
  });

  it('on a narrow screen lists the contents until a section is chosen', async () => {
    await renderPack({ pack: filled, wide: false });

    expect(screen.getByTestId('pack-layout').dataset.layout).toBe('narrow');
    expect(screen.getByTestId('pack-bar')).toBeTruthy();
    expect(entries()).toHaveLength(12);
    expect(entries().every((each) => each.getAttribute('aria-current') === null)).toBe(true);
    expect(screen.queryByTestId('pack-section')).toBeNull();

    await userEvent.click(entry('2'));

    expect((await screen.findByTestId('pack-section-title')).textContent).toBe(
      'Material de instruire introductiv-generală'
    );
    expect(screen.queryByTestId('pack-contents')).toBeNull();
    expect(screen.queryByTestId('pack-header')).toBeNull();
  });

  it('on a narrow screen shows only the section the URL names, with the way back', async () => {
    const router = await renderPack({
      pack: filled,
      wide: false,
      url: `/clients/${clientId}/documents?section=decisions`,
    });

    expect(screen.getByTestId('pack-section-title').textContent).toBe('Decizii interne');
    expect(screen.getByTestId('pack-next-section').textContent).toContain(
      '2. Material de instruire introductiv-generală'
    );
    const back = screen.getByTestId('pack-back');
    expect(back.textContent).toBe('Cuprinsul documentației');
    expect(back.getAttribute('href')).toBe(`/clients/${clientId}/documents`);

    await userEvent.click(back);

    expect(await screen.findAllByTestId('pack-contents-entry')).toHaveLength(12);
    expect(router.state.location.search).toEqual({});
  });

  it('shows what the pack will hold beside the way to generate it', async () => {
    await renderPack({ pack: empty, wide: true });

    expect(screen.queryByTestId('pack-bar')).toBeNull();
    expect(screen.getByTestId('pack-total').textContent).toBe('6 documente în 2 secțiuni');
    const outline = screen.getByRole('list', { name: 'Cuprinsul documentației' });
    expect(
      within(outline)
        .getAllByTestId('pack-section-caption')
        .map((caption) => caption.textContent)
    ).toEqual(['5 documente, negenerate', '1 document, negenerat']);
    const panel = screen.getByTestId('pack-empty-panel');
    expect(within(panel).getByRole('heading').textContent).toBe(
      'Documentația SSM nu este generată încă'
    );
    expect(within(panel).getByTestId('documents-hint').textContent).toMatch(
      /^Generează documentația ca să obții .*\. Cuprinsul din stânga arată ce va conține\.$/
    );
    expect(within(panel).getByTestId('documents-generate')).toBeTruthy();
    expect(screen.queryByTestId('pack-section')).toBeNull();
  });

  it('tells an archived client why nothing is generated, without the button', async () => {
    await renderPack({ pack: empty, wide: true, readOnly: true, set: 'fire_safety' });

    const panel = screen.getByTestId('pack-empty-panel');
    expect(within(panel).getByRole('heading').textContent).toBe(
      'Documentația PSI nu este generată încă'
    );
    expect(within(panel).getByTestId('documents-hint').textContent).toBe(
      'Clientul este arhivat, așa că nu i se mai generează documente.'
    );
    expect(within(panel).queryByTestId('documents-generate')).toBeNull();
  });

  it('on a narrow screen folds what the pack will hold under the way to generate it', async () => {
    await renderPack({ pack: empty, wide: false });

    expect(screen.getByTestId('documents-hint').textContent).not.toContain('Cuprinsul');
    expect(screen.getByTestId('documents-generate')).toBeTruthy();
    const toggle = screen.getByTestId('pack-empty-outline-toggle');
    expect(toggle.textContent).toBe('Ce va cuprinde documentația6 documente în 2 secțiuni');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('pack-empty-entry').map((each) => each.textContent)).toEqual([
      '1Decizii interne5 documente',
      '8Referat de control1 document',
    ]);

    await userEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('pack-empty-outline')).toBeNull();
  });

  it('on a narrow screen keeps the archived hint and drops the button', async () => {
    await renderPack({ pack: empty, wide: false, readOnly: true });

    expect(screen.getByTestId('documents-hint').textContent).toBe(
      'Clientul este arhivat, așa că nu i se mai generează documente.'
    );
    expect(screen.queryByTestId('documents-generate')).toBeNull();
  });
});

describe('MissingDocumentRow', () => {
  it('reads as not generated, with no date and no menu', () => {
    render(
      <PackTable>
        <MissingDocumentRow
          row={{
            kind: 'missing',
            key: 'fire_site_sheet',
            title: 'Fișa obiectivului',
            document: null,
            status: 'missing',
          }}
        />
      </PackTable>
    );

    const missing = screen.getByTestId('document-missing');
    expect(
      within(missing)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['Fișa obiectivului', 'Negenerat', '—', '']);
    expect(within(missing).queryByRole('button')).toBeNull();
  });
});
