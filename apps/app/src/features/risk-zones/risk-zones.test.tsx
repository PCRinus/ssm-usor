import type {
  RiskZone,
  RiskZoneFactor,
  RiskZonesResponse,
  RiskZoneSuggestion,
} from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { bodiesOf, installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { clientId, clientRecord } from '@/test/records';
import { riskZonesPath } from '@/test/risk-zones';

const positionsPage = `/clienti/${clientId}/posturi`;
const zonesPath = riskZonesPath(clientId);
const statePath = `/clients/${clientId}/risk-zones-state`;
const ignorePath = `/clients/${clientId}/risk-zone-suggestions/ignore`;
const restorePath = `/clients/${clientId}/risk-zone-suggestions/restore`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const cook = {
  id: id(101),
  kind: 'job_position',
  title: 'Bucătar',
  jobPositionId: id(201),
} as const;
const helper = {
  id: id(102),
  kind: 'job_position',
  title: 'Ajutor de bucătar',
  jobPositionId: id(202),
} as const;
const storekeeper = {
  id: id(103),
  kind: 'job_position',
  title: 'Gestionar',
  jobPositionId: id(203),
} as const;
const sensitive = {
  id: id(104),
  kind: 'sensitive_groups',
  title: 'Grupuri sensibile',
  jobPositionId: null,
} as const;

const factor = (
  n: number,
  evaluation: RiskZoneFactor['evaluation'],
  riskLevel: number,
  description: string,
  measures: [RiskZoneFactor['measures'][number]['kind'], string][] = []
): RiskZoneFactor => ({
  id: id(n),
  component: 'means_of_production',
  group: 'Factori de risc',
  description,
  riskLevel,
  evaluation,
  measures: measures.map(([kind, text], index) => ({
    id: id(n * 10 + index),
    kind,
    description: text,
  })),
});

const burns = factor(1, cook, 6, 'Arsuri prin contact cu suprafețe fierbinți', [
  ['technical', 'Mânere izolate termic'],
  ['organizational', 'Instruire periodică la locul de muncă'],
]);
const noise = factor(2, cook, 3, 'Zgomot de la hotă');
const cuts = factor(3, helper, 5, 'Tăiere la feliatorul de carne', [
  ['technical', 'Feliatorul se folosește cu protecția lamei'],
  ['organizational', 'Instruire periodică la locul de muncă.'],
]);
const fall = factor(4, storekeeper, 4, 'Cădere de pe scara de acces', [
  ['other', 'Scară cu platformă'],
]);
const lifting = factor(5, sensitive, 4, 'Ridicarea lăzilor de către lucrătoarea gravidă');

const kitchen: RiskZoneSuggestion = {
  name: 'Bucătărie',
  origin: 'work_zone',
  factors: [burns, cuts],
  existingZoneId: null,
};
const store: RiskZoneSuggestion = {
  name: 'Depozit',
  origin: 'work_zone',
  factors: [fall],
  existingZoneId: null,
};
const groups: RiskZoneSuggestion = {
  name: 'Grupuri sensibile',
  origin: 'evaluation',
  factors: [lifting],
  existingZoneId: null,
};

const allFactors = [burns, noise, cuts, fall, lifting];

const zone = (fields: Partial<RiskZone> & Pick<RiskZone, 'id' | 'name'>): RiskZone => ({
  clientId,
  workplace: null,
  location: null,
  measures: null,
  factors: [],
  createdAt: '2026-11-23T10:00:00.000Z',
  updatedAt: '2026-11-23T10:00:00.000Z',
  ...fields,
});

const panel = zone({
  id: id(301),
  name: 'Tabloul electric general',
  workplace: { id: id(401), name: 'Sediu' },
  location: 'parter, camera tehnică',
  measures: 'Acces numai pentru electricianul autorizat',
});
const kitchenZone = zone({
  id: id(302),
  name: 'Bucătărie',
  workplace: { id: id(401), name: 'Sediu' },
  location: 'parter',
  factors: [burns, cuts],
});

const response = (fields: Partial<RiskZonesResponse> = {}): RiskZonesResponse => ({
  state: 'undecided',
  zones: [],
  suggestions: [kitchen, store],
  ignoredSuggestions: [],
  factors: allFactors,
  ...fields,
});

type Answer = (body: Record<string, unknown>, url: URL) => Response;

function mockZonesApi({
  initial = response(),
  archived = false,
  answers = {},
}: {
  initial?: RiskZonesResponse;
  archived?: boolean;
  answers?: Partial<Record<string, Answer>>;
} = {}) {
  let data = initial;
  const client = clientRecord(archived ? { archivedAt: '2026-11-01T10:00:00.000Z' } : {});
  mockApi((init, url) => {
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/job-positions`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/risk-evaluations`) {
      return Response.json({ items: [], sensitiveGroupsState: 'none' });
    }
    if (pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({ items: [{ id: id(401), name: 'Sediu' }] });
    }
    if (pathname === '/risk-zone-names') {
      return Response.json({
        items: [
          { name: 'Bucătăria caldă', measures: 'Hota se curăță lunar de o firmă autorizată.' },
          { name: 'Camera centralei termice', measures: null },
        ],
      });
    }
    const answer = answers[`${method} ${pathname}`];
    if (answer) {
      const reply = answer(body, url);
      if (reply.ok) {
        void reply
          .clone()
          .json()
          .then((next: RiskZonesResponse) => (data = next));
      }
      return reply;
    }
    if (pathname === zonesPath && method === 'GET') return Response.json(data);
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, positionsPage);

async function findCard() {
  const card = await screen.findByTestId('risk-zones-card');
  await within(card).findByText(
    /Sugestii din fișele de evaluare|Nicio zonă|Clientul nu are zone|sugestii? ignorat/
  );
  return card;
}

installFetchMock();

describe('the risk zones card', () => {
  it('waits for the zones or the declaration, and suggests the unacceptable factors by work zone', async () => {
    mockZonesApi();
    mount();
    const card = await findCard();

    expect(within(card).getByTestId('risk-zones-status').textContent).toBe(
      'Documentul 9.2: așteaptă zonele clientului sau declarația că nu are'
    );
    expect(within(card).getByTestId('risk-zone-add').textContent).toBe('Adaugă o zonă');
    const rows = within(card).getAllByTestId('risk-zone-suggestion');
    expect(
      rows.map((row) => within(row).getByTestId('risk-zone-suggestion-name').textContent)
    ).toEqual(['Bucătărie', 'Depozit']);
    const first = rows[0]!;
    expect(within(first).getByText('Sugestie')).toBeTruthy();
    expect(within(first).getByTestId('risk-zone-source').textContent).toBe(
      'Zona de lucru a posturilor Bucătar și Ajutor de bucătar'
    );
    const links = within(within(first).getByTestId('risk-zone-source')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `${positionsPage}/${cook.jobPositionId}/fisa-de-evaluare`,
      `${positionsPage}/${helper.jobPositionId}/fisa-de-evaluare`,
    ]);
    expect(
      within(first)
        .getAllByTestId('risk-level')
        .map((tile) => tile.textContent)
    ).toEqual(['Nivel 6, inacceptabil', 'Nivel 5, inacceptabil']);
    expect(
      within(first)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Confirmă zona', 'Modifică și confirmă', 'Ignoră']);
    expect(within(rows[1]!).getByTestId('risk-zone-source').textContent).toBe(
      'Zona de lucru a postului Gestionar'
    );
    expect(within(card).getByTestId('risk-zones-none').textContent).toBe(
      'Nu există zone cu risc ridicat și specific'
    );
  });

  it('names where a suggestion comes from when no work zone names it', async () => {
    mockZonesApi({
      initial: response({
        suggestions: [{ ...store, name: 'Gestionar', origin: 'evaluation' }, groups],
      }),
    });
    mount();
    const card = await findCard();
    const sources = within(card).getAllByTestId('risk-zone-source');
    expect(sources.map((source) => source.textContent)).toEqual([
      'Fișa de evaluare a postului Gestionar',
      'Fișa de evaluare Grupuri sensibile',
    ]);
    expect(within(sources[1]!).getByRole('link').getAttribute('href')).toBe(
      `${positionsPage}/fise-de-evaluare/${sensitive.id}`
    );
  });

  it('confirms a suggestion as it is and lists the zone with its factors and measures', async () => {
    mockZonesApi({
      answers: {
        [`POST ${zonesPath}`]: () =>
          Response.json(response({ state: 'listed', zones: [kitchenZone], suggestions: [store] }), {
            status: 201,
          }),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();
    const [first] = within(card).getAllByTestId('risk-zone-suggestion');

    await user.click(within(first!).getByTestId('risk-zone-confirm'));
    await waitFor(() =>
      expect(bodiesOf(zonesPath, 'POST')).toEqual([
        {
          name: 'Bucătărie',
          workplaceId: null,
          location: null,
          measures: null,
          factorIds: [burns.id, cuts.id],
        },
      ])
    );
    expect(await screen.findByText('Zona a fost confirmată.')).toBeTruthy();
    const [row] = await within(card).findAllByTestId('risk-zone-row');
    expect(within(row!).getByTestId('risk-zone-name').textContent).toBe('Bucătărie');
    expect(within(row!).getByTestId('risk-zone-place').textContent).toBe('Sediu – parter');
    expect(within(row!).getAllByTestId('risk-zone-factor-line')).toHaveLength(2);
    expect(within(row!).getByTestId('risk-zone-measures').textContent).toBe(
      'Măsuri:3 din factorii legați'
    );
    expect(within(card).queryByTestId('risk-zones-status')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-none')).toBeNull();
    expect(within(card).getAllByTestId('risk-zone-suggestion')).toHaveLength(1);
  });

  it('opens a suggestion in the editor and confirms it from there', async () => {
    mockZonesApi({
      answers: {
        [`POST ${zonesPath}`]: () =>
          Response.json(response({ state: 'listed', zones: [kitchenZone] }), { status: 201 }),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();
    const [first] = within(card).getAllByTestId('risk-zone-suggestion');

    await user.click(within(first!).getByTestId('risk-zone-edit-confirm'));
    const editor = await screen.findByTestId('risk-zone-editor');
    expect(within(editor).getByTestId('risk-zone-name').textContent).toContain('Bucătărie');
    expect(within(editor).getByTestId('risk-zone-factor-count').textContent).toBe('2 aleși');
    expect(within(editor).getByTestId('risk-zone-save').textContent).toBe('Confirmă zona');
    const factorRows = within(editor).getAllByTestId('risk-zone-factor');
    expect(factorRows.map((row) => row.textContent)).toEqual([
      'Nivel 6, inacceptabilArsuri prin contact cu suprafețe fierbinți',
      'Nivel 3Zgomot de la hotă',
      'Nivel 5, inacceptabilTăiere la feliatorul de carne',
      'Nivel 4, inacceptabilCădere de pe scara de acces',
      'Nivel 4, inacceptabilRidicarea lăzilor de către lucrătoarea gravidă',
    ]);
    const preview = within(editor).getByTestId('risk-zone-preview');
    expect(
      within(preview)
        .getAllByTestId('risk-zone-preview-group')
        .map((group) => group.textContent)
    ).toEqual([
      'Tehnică–Mânere izolate termic–Feliatorul se folosește cu protecția lamei',
      'Organizatorică–Instruire periodică la locul de muncă',
    ]);

    await user.selectOptions(within(editor).getByTestId('risk-zone-workplace'), 'Sediu');
    await user.type(within(editor).getByTestId('risk-zone-location'), 'parter');
    await user.type(within(editor).getByTestId('risk-zone-measures'), 'Stingător lângă plită');
    expect(within(preview).getAllByTestId('risk-zone-preview-group').at(-1)!.textContent).toBe(
      'Proprii zonei–Stingător lângă plită'
    );
    await user.click(within(editor).getByTestId('risk-zone-save'));
    await waitFor(() =>
      expect(bodiesOf(zonesPath, 'POST')).toEqual([
        {
          name: 'Bucătărie',
          workplaceId: id(401),
          location: 'parter',
          measures: 'Stingător lângă plită',
          factorIds: [burns.id, cuts.id],
        },
      ])
    );
    await waitFor(() => expect(screen.queryByTestId('risk-zone-editor')).toBeNull());
  });

  it('ignores a suggestion, counts it apart and restores it', async () => {
    mockZonesApi({
      answers: {
        [`POST ${ignorePath}`]: () =>
          Response.json(response({ suggestions: [kitchen], ignoredSuggestions: [store] })),
        [`POST ${restorePath}`]: () => Response.json(response()),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();
    const rows = within(card).getAllByTestId('risk-zone-suggestion');

    await user.click(within(rows[1]!).getByTestId('risk-zone-ignore'));
    await waitFor(() => expect(bodiesOf(ignorePath, 'POST')).toEqual([{ factorIds: [fall.id] }]));
    expect(await screen.findByText('Sugestia a fost ignorată.')).toBeTruthy();
    expect((await within(card).findByTestId('risk-zones-ignored-count')).textContent).toBe(
      'o sugestie ignorată'
    );
    expect(within(card).getAllByTestId('risk-zone-suggestion')).toHaveLength(1);
    const toggle = within(card).getByTestId('risk-zones-ignored-toggle');
    expect(toggle.textContent).toBe('Arată');
    expect(within(card).queryByTestId('risk-zone-ignored')).toBeNull();

    await user.click(toggle);
    expect(toggle.textContent).toBe('Ascunde');
    const ignored = within(card).getByTestId('risk-zone-ignored');
    expect(within(ignored).queryByText('Sugestie')).toBeNull();
    expect(within(ignored).getByTestId('risk-zone-source').textContent).toBe(
      'Zona de lucru a postului Gestionar'
    );
    await user.click(within(ignored).getByTestId('risk-zone-restore'));
    await waitFor(() => expect(bodiesOf(restorePath, 'POST')).toEqual([{ factorIds: [fall.id] }]));
    await waitFor(() =>
      expect(within(card).getAllByTestId('risk-zone-suggestion')).toHaveLength(2)
    );
    expect(within(card).queryByTestId('risk-zones-ignored')).toBeNull();
  });

  it('shows only the ignored count where the suggestions were once all are ignored', async () => {
    mockZonesApi({
      initial: response({ suggestions: [], ignoredSuggestions: [kitchen, store] }),
    });
    mount();
    const card = await findCard();
    expect(within(card).getByTestId('risk-zones-ignored-count').textContent).toBe(
      '2 sugestii ignorate'
    );
    expect(within(card).queryByTestId('risk-zone-suggestions')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-empty')).toBeNull();
    expect(within(card).getByTestId('risk-zones-none')).toBeTruthy();
  });

  it('adds the factors of a suggestion to the zone of its name', async () => {
    const opened = factor(6, cook, 4, 'Opărire cu abur la cuptor');
    mockZonesApi({
      initial: response({
        state: 'listed',
        zones: [kitchenZone],
        suggestions: [{ ...kitchen, factors: [opened], existingZoneId: kitchenZone.id }],
        factors: [...allFactors, opened],
      }),
      answers: {
        [`PUT ${zonesPath}/${kitchenZone.id}`]: () =>
          Response.json(
            response({
              state: 'listed',
              zones: [{ ...kitchenZone, factors: [burns, cuts, opened] }],
              suggestions: [],
            })
          ),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();
    const [suggestion] = within(card).getAllByTestId('risk-zone-suggestion');
    expect(
      within(suggestion!)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Adaugă la zona Bucătărie', 'Ignoră']);

    await user.click(within(suggestion!).getByTestId('risk-zone-join'));
    await waitFor(() =>
      expect(bodiesOf(`${zonesPath}/${kitchenZone.id}`, 'PUT')).toEqual([
        {
          name: 'Bucătărie',
          workplaceId: id(401),
          location: 'parter',
          measures: null,
          factorIds: [burns.id, cuts.id, opened.id],
        },
      ])
    );
    expect(await screen.findByText('Factorii au fost adăugați la zona Bucătărie.')).toBeTruthy();
  });

  it('declares there are none, hiding every suggestion, and takes the declaration back', async () => {
    mockZonesApi({
      initial: response({ ignoredSuggestions: [groups] }),
      answers: {
        [`PUT ${statePath}`]: (body) =>
          Response.json(
            body.state === 'none'
              ? response({ state: 'none', ignoredSuggestions: [groups] })
              : response({ ignoredSuggestions: [groups] })
          ),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();

    await user.click(within(card).getByTestId('risk-zones-none'));
    await waitFor(() => expect(bodiesOf(statePath, 'PUT')).toEqual([{ state: 'none' }]));
    const declared = await within(card).findByTestId('risk-zones-declared');
    expect(declared.textContent).toContain('Clientul nu are zone cu risc ridicat și specific');
    expect(within(card).queryByTestId('risk-zone-suggestion')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-ignored')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-status')).toBeNull();
    expect(
      within(declared)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Modifică', 'Adaugă totuși o zonă']);

    await user.click(within(declared).getByTestId('risk-zones-add-anyway'));
    const editor = await screen.findByTestId('risk-zone-editor');
    expect(within(editor).getByTestId('risk-zone-save').textContent).toBe('Adaugă zona');
    await user.click(within(editor).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByTestId('risk-zone-editor')).toBeNull());

    await user.click(within(card).getByTestId('risk-zones-undo'));
    await waitFor(() =>
      expect(bodiesOf(statePath, 'PUT')).toEqual([{ state: 'none' }, { state: 'undecided' }])
    );
    expect(await within(card).findAllByTestId('risk-zone-suggestion')).toHaveLength(2);
    expect(within(card).getByTestId('risk-zones-status')).toBeTruthy();
  });

  it('offers to add a zone or declare none when nothing is suggested', async () => {
    mockZonesApi({ initial: response({ suggestions: [] }) });
    mount();
    const card = await findCard();
    const empty = within(card).getByTestId('risk-zones-empty');
    expect(within(empty).getByText('Nicio zonă cu risc ridicat și specific')).toBeTruthy();
    expect(
      within(empty)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Adaugă o zonă', 'Nu există zone cu risc ridicat și specific']);
    expect(within(card).getByTestId('risk-zone-add')).toBeTruthy();
  });

  it('asks for a factor or measures, takes a name used before with its measures, and puts a taken name on the field', async () => {
    mockZonesApi({
      initial: response({ suggestions: [] }),
      answers: {
        [`POST ${zonesPath}`]: () =>
          Response.json(
            {
              error: 'conflict',
              message: 'taken',
              reason: 'risk_zone_name_taken',
              issues: [{ path: 'name', message: 'taken' }],
            },
            { status: 409 }
          ),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await findCard();

    await user.click(within(card).getByTestId('risk-zone-add'));
    const editor = await screen.findByTestId('risk-zone-editor');
    expect(within(editor).getByTestId('risk-zone-factor-count').textContent).toBe('niciunul ales');
    await user.click(within(editor).getByTestId('risk-zone-name'));
    await user.type(await screen.findByTestId('risk-zone-name-search'), 'Camera centralei');
    await user.click(await screen.findByRole('option', { name: 'Folosește „Camera centralei”' }));
    await user.click(within(editor).getByTestId('risk-zone-save'));
    expect((await within(editor).findByTestId('risk-zone-measures-error')).textContent).toBe(
      'Alege cel puțin un factor de risc sau scrie măsurile proprii ale zonei.'
    );
    expect(requestsTo(zonesPath, 'POST')).toHaveLength(0);

    await user.click(within(editor).getByTestId('risk-zone-name'));
    await user.type(await screen.findByTestId('risk-zone-name-search'), 'calda');
    await user.click(await screen.findByRole('option', { name: /Bucătăria caldă/ }));
    expect((within(editor).getByTestId('risk-zone-measures') as HTMLTextAreaElement).value).toBe(
      'Hota se curăță lunar de o firmă autorizată.'
    );
    expect(within(editor).queryByTestId('risk-zone-measures-error')).toBeNull();

    await user.type(within(editor).getByTestId('risk-zone-factor-search'), 'scara');
    expect(within(editor).getAllByTestId('risk-zone-factor')).toHaveLength(1);
    await user.click(within(editor).getByTestId('risk-zone-factor-check'));
    expect(within(editor).getByTestId('risk-zone-factor-count').textContent).toBe('un factor ales');

    await user.click(within(editor).getByTestId('risk-zone-save'));
    expect((await within(editor).findByTestId('risk-zone-name-error')).textContent).toBe(
      'Clientul are deja o zonă cu această denumire.'
    );
    expect(bodiesOf(zonesPath, 'POST')).toEqual([
      {
        name: 'Bucătăria caldă',
        workplaceId: null,
        location: null,
        measures: 'Hota se curăță lunar de o firmă autorizată.',
        factorIds: [fall.id],
      },
    ]);
  });

  it('edits and deletes a zone from its menu', async () => {
    mockZonesApi({
      initial: response({ state: 'listed', zones: [panel, kitchenZone], suggestions: [] }),
      answers: {
        [`PUT ${zonesPath}/${panel.id}`]: () =>
          Response.json(
            response({
              state: 'listed',
              zones: [{ ...panel, location: 'subsol' }, kitchenZone],
              suggestions: [],
            })
          ),
        [`DELETE ${zonesPath}/${kitchenZone.id}`]: () =>
          Response.json(response({ state: 'listed', zones: [panel], suggestions: [] })),
      },
    });
    mount();
    const user = userEvent.setup();
    const card = await screen.findByTestId('risk-zones-card');
    const rows = await within(card).findAllByTestId('risk-zone-row');
    expect(within(rows[0]!).getByTestId('risk-zone-measures').textContent).toBe(
      'Măsuri proprii:Acces numai pentru electricianul autorizat'
    );
    expect(within(rows[0]!).queryAllByTestId('risk-zone-factor-line')).toHaveLength(0);

    await user.click(within(rows[0]!).getByTestId('risk-zone-actions'));
    await user.click(await screen.findByTestId('risk-zone-edit'));
    const editor = await screen.findByTestId('risk-zone-editor');
    expect(within(editor).getByTestId('risk-zone-save').textContent).toBe('Salvează');
    const location = within(editor).getByTestId('risk-zone-location');
    await user.clear(location);
    await user.type(location, 'subsol');
    await user.click(within(editor).getByTestId('risk-zone-save'));
    await waitFor(() =>
      expect(bodiesOf(`${zonesPath}/${panel.id}`, 'PUT')).toEqual([
        {
          name: 'Tabloul electric general',
          workplaceId: id(401),
          location: 'subsol',
          measures: 'Acces numai pentru electricianul autorizat',
          factorIds: [],
        },
      ])
    );
    expect(await screen.findByText('Zona a fost salvată.')).toBeTruthy();

    await user.click(within(rows[1]!).getByTestId('risk-zone-actions'));
    await user.click(await screen.findByTestId('risk-zone-remove'));
    await user.click(await screen.findByTestId('risk-zone-remove-confirm'));
    await waitFor(() =>
      expect(requestsTo(`${zonesPath}/${kitchenZone.id}`, 'DELETE')).toHaveLength(1)
    );
    await waitFor(() => expect(within(card).getAllByTestId('risk-zone-row')).toHaveLength(1));
  });

  it('says 9.2 waits for a zone that would print no measures', async () => {
    mockZonesApi({
      initial: response({
        state: 'listed',
        zones: [zone({ id: id(303), name: 'Hală', factors: [noise] })],
        suggestions: [],
      }),
    });
    mount();
    const card = await screen.findByTestId('risk-zones-card');
    expect((await within(card).findByTestId('risk-zones-status')).textContent).toBe(
      'Documentul 9.2: așteaptă măsurile fiecărei zone'
    );
    expect(within(card).getByTestId('risk-zone-measures').textContent).toBe(
      'Măsuri:niciuna de tipărit; leagă un factor cu măsuri sau scrie măsurile proprii'
    );
  });

  it('only reads the zones of an archived client', async () => {
    mockZonesApi({
      archived: true,
      initial: response({ state: 'listed', zones: [panel], ignoredSuggestions: [groups] }),
    });
    mount();
    const card = await screen.findByTestId('risk-zones-card');
    await within(card).findByTestId('risk-zone-row');
    expect(within(card).queryByTestId('risk-zone-add')).toBeNull();
    expect(within(card).queryByTestId('risk-zone-actions')).toBeNull();
    expect(within(card).queryByTestId('risk-zone-suggestion')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-ignored')).toBeNull();
    expect(within(card).queryByTestId('risk-zones-status')).toBeNull();
  });

  it('shows what the server refused, in its words', async () => {
    mockZonesApi({
      answers: {
        [`PUT ${statePath}`]: () =>
          Response.json(
            { error: 'conflict', message: 'listed', reason: 'risk_zones_listed' },
            { status: 409 }
          ),
      },
    });
    mount();
    const card = await findCard();
    await userEvent.setup().click(within(card).getByTestId('risk-zones-none'));
    expect((await within(card).findByTestId('risk-zones-error')).textContent).toBe(
      'Clientul are deja zone cu risc ridicat și specific; reîncarcă pagina ca să le vezi.'
    );
  });
});
