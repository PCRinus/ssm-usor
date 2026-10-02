import { evaluationGlobalRiskLevel, riskLevel } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { evaluationFailure } from './evaluation-failure';
import {
  evaluationStateLabel,
  factorCountLabel,
  type RiskEvaluation,
  type RiskFactor,
  sectionsOf,
} from './risk-evaluation-schema';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: 'București',
  addressLine: null,
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const welder = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Sudor',
  staffCategory: 'execution',
  workZone: 'Atelier',
  activities: 'Sudură electrică și autogenă.',
  trainingIntervalMonths: null as number | null,
  employeeCount: 3,
  needsProtectiveEquipment: true as boolean | null,
  equipmentCount: 2,
  needsInstructions: true as boolean | null,
  instructionCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};
const fitter = { ...welder, id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d', name: 'Lăcătuș mecanic' };
const cashier = { ...welder, id: '3f1d2c4b-5a6e-4f7a-8b9c-0d1e2f3a4b5c', name: 'Casier' };

const stamp = '2026-10-01T10:00:00.000Z';
let nextId = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;

function makeFactor(
  fields: Partial<RiskFactor> & Pick<RiskFactor, 'gravityClass' | 'probabilityClass'>
) {
  return {
    id: uuid(),
    component: 'means_of_production',
    group: 'Factori de risc mecanic',
    description: 'Factor',
    measures: [],
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
    riskLevel: riskLevel(fields.gravityClass, fields.probabilityClass),
  } satisfies RiskFactor;
}

const careless = makeFactor({
  component: 'executant',
  group: 'Acțiuni greșite',
  description: 'Neutilizarea echipamentului de protecție',
  gravityClass: 3,
  probabilityClass: 4,
});
const movingParts = makeFactor({
  description: 'Lovire de piese în mișcare',
  gravityClass: 4,
  probabilityClass: 5,
  measures: [{ id: uuid(), kind: 'technical', description: 'Apărători la piesele în mișcare' }],
  deadline: 'Permanent',
  responsiblePerson: 'Șef atelier',
});
const electric = makeFactor({
  group: 'Factori de risc electric',
  description: 'Electrocutare prin atingere indirectă',
  gravityClass: 7,
  probabilityClass: 2,
});
const cuts = makeFactor({
  description: 'Tăiere cu scule de mână',
  gravityClass: 2,
  probabilityClass: 3,
});

function makeEvaluation(fields: Partial<RiskEvaluation>): RiskEvaluation {
  const factors = fields.factors ?? [];
  return {
    id: uuid(),
    clientId,
    kind: 'job_position',
    jobPosition: { id: welder.id, name: welder.name },
    name: null,
    meansOfProduction: 'Aparat de sudură, polizor unghiular.',
    workEnvironment: 'Atelier ventilat natural.',
    exposure: '8 h / schimb',
    workTask: null,
    exposedPersons: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
  };
}

const welderEvaluation = makeEvaluation({ factors: [careless, movingParts, electric, cuts] });
const cashierEvaluation = makeEvaluation({
  jobPosition: { id: cashier.id, name: cashier.name },
  factors: [],
});
const visitors = makeEvaluation({
  kind: 'other',
  jobPosition: null,
  name: 'Vizitatori',
  workTask: 'Vizitează atelierul însoțiți.',
  exposedPersons: 'Min. 3 persoane',
  factors: [
    makeFactor({ description: 'Alunecare pe pardoseală', gravityClass: 2, probabilityClass: 2 }),
  ],
});

const summaryOf = ({ factors, ...evaluation }: RiskEvaluation) => ({
  ...evaluation,
  factorCount: factors.length,
  unacceptableFactorCount: factors.filter((factor) => factor.riskLevel > 3).length,
});

const positionsPath = `/clients/${clientId}/job-positions`;
const evaluationsPath = `/clients/${clientId}/risk-evaluations`;
const welderPath = `${positionsPath}/${welder.id}`;
const welderEvaluationPath = `${welderPath}/risk-evaluation`;

type Handler = (init: RequestInit | undefined, url: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  evaluations = [welderEvaluation, cashierEvaluation, visitors],
  create,
  suggestions = (() =>
    Response.json({ items: ['Factori de risc mecanic', 'Permanent'] })) as Handler,
}: {
  client?: typeof sampleClient;
  evaluations?: RiskEvaluation[];
  create?: Handler;
  suggestions?: Handler;
} = {}) {
  const store = new Map(evaluations.map((evaluation) => [evaluation.id, evaluation]));
  const answer = (evaluation: RiskEvaluation, status = 200) => {
    const recomputed = makeEvaluation(evaluation);
    store.set(recomputed.id, recomputed);
    return Response.json({ evaluation: recomputed }, { status });
  };
  const created: Handler = (init) => {
    const body = JSON.parse(String(init?.body)) as { kind: RiskEvaluation['kind']; name?: string };
    return answer(
      makeEvaluation({
        kind: body.kind,
        jobPosition: body.kind === 'job_position' ? { id: fitter.id, name: fitter.name } : null,
        name: body.name ?? null,
      }),
      201
    );
  };
  const toFactor = (body: Record<string, unknown>, id = uuid()) =>
    makeFactor({
      ...(body as Partial<RiskFactor> & Pick<RiskFactor, 'gravityClass' | 'probabilityClass'>),
      id,
      measures: ((body.measures ?? []) as RiskFactor['measures']).map((measure) => ({
        ...measure,
        id: uuid(),
      })),
    });

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === positionsPath) {
      return Response.json({ items: [welder, fitter, cashier] });
    }
    if (pathname.endsWith('/equipment')) {
      return Response.json({ items: [], needsProtectiveEquipment: true });
    }
    if (pathname.endsWith('/instructions')) {
      return Response.json({ items: [], needsInstructions: true });
    }
    if (pathname === '/risk-factor-suggestions') return suggestions(init, url);
    const byPosition = pathname.match(/\/job-positions\/([^/]+)\/risk-evaluation$/);
    if (byPosition) {
      const evaluation = [...store.values()].find(
        (candidate) => candidate.jobPosition?.id === byPosition[1]
      );
      return Response.json({ evaluation: evaluation ?? null });
    }
    if (pathname === evaluationsPath) {
      return method === 'POST'
        ? (create ?? created)(init, url)
        : Response.json({ items: [...store.values()].map(summaryOf) });
    }
    const match = pathname.match(
      /\/risk-evaluations\/([^/]+)(?:\/(factors|factor-order)(?:\/([^/]+))?)?$/
    );
    if (match) {
      const [, evaluationId, part, factorId] = match;
      const evaluation = store.get(evaluationId!);
      if (!evaluation) return Response.json({ error: 'not_found', message: 'no' }, { status: 404 });
      if (!part) {
        if (method === 'DELETE') {
          store.delete(evaluation.id);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH') return answer({ ...evaluation, ...body });
        return Response.json({ evaluation });
      }
      if (factorId === 'copy') {
        const source = store.get(String(body.fromEvaluationId))!;
        return answer({
          ...evaluation,
          factors: [
            ...evaluation.factors,
            ...source.factors.map((factor) => ({ ...factor, id: uuid() })),
          ],
        });
      }
      if (factorId && method === 'DELETE') {
        return answer({
          ...evaluation,
          factors: evaluation.factors.filter((factor) => factor.id !== factorId),
        });
      }
      if (factorId) {
        return answer({
          ...evaluation,
          factors: evaluation.factors.map((factor) =>
            factor.id === factorId ? toFactor(body, factorId) : factor
          ),
        });
      }
      return answer({ ...evaluation, factors: [...evaluation.factors, toFactor(body)] }, 201);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (pathname: string, method: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
    )
    .map(([, init]) => (init?.body ? (JSON.parse(String(init.body)) as unknown) : null));

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the positions table', () => {
  it("says where each position's risk evaluation stands, linking to it", async () => {
    mockApi();
    mount(positionsPath);
    const rows = await screen.findAllByTestId('job-position-row');
    await waitFor(() => expect(within(rows[0]!).getByTestId('job-position-risk')).toBeTruthy());
    expect(rows.map((row) => within(row).getByTestId('job-position-risk').textContent)).toEqual([
      '4 factori · 3,86',
      'Neevaluat',
      'Fără factori',
    ]);
    expect(within(rows[1]!).getByTestId('job-position-risk').getAttribute('href')).toBe(
      `${positionsPath}/${fitter.id}/risk-evaluation`
    );
  });
});

describe("a position's risk evaluation card", () => {
  it('sums up the evaluation and opens it', async () => {
    mockApi();
    const runtime = mount(welderPath);
    const card = await screen.findByTestId('position-risk-card');
    await waitFor(() => expect(within(card).getByTestId('position-risk-state')).toBeTruthy());
    expect(within(card).getByTestId('position-risk-level').textContent).toBe(
      '3,86, peste limita acceptabilă de 3,50'
    );
    expect(within(card).getByTestId('position-risk-factors').textContent).toBe('4');
    expect(within(card).getByTestId('position-risk-unacceptable').textContent).toBe('2');

    await userEvent.setup().click(within(card).getByTestId('position-risk-open'));
    await screen.findByTestId('risk-evaluation-page');
    expect(runtime.router.state.location.pathname).toBe(welderEvaluationPath);
  });

  it('starts the evaluation of a position that has none, and opens it', async () => {
    mockApi();
    const runtime = mount(`${positionsPath}/${fitter.id}`);
    const user = userEvent.setup();
    const card = await screen.findByTestId('position-risk-card');
    expect((await within(card).findByTestId('position-risk-state')).textContent).toBe('Neevaluat');

    await user.click(within(card).getByTestId('position-risk-start'));
    await waitFor(() =>
      expect(requests(evaluationsPath, 'POST')).toEqual([
        { kind: 'job_position', jobPositionId: fitter.id },
      ])
    );
    await screen.findByTestId('risk-factors-empty');
    expect(runtime.router.state.location.pathname).toBe(
      `${positionsPath}/${fitter.id}/risk-evaluation`
    );
  });
});

describe("a position's risk evaluation page", () => {
  it('lists the factors in the order of the sheet, each with its component and group', async () => {
    mockApi();
    mount(welderEvaluationPath);
    await screen.findByTestId('risk-evaluation-page');
    expect(screen.getByRole('heading', { level: 2, name: 'Sudor' })).toBeTruthy();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Sudor' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Evaluare de risc')).toBeTruthy();

    expect(screen.getAllByTestId('risk-factors-tab').map((tab) => tab.textContent)).toEqual([
      'Toți 4',
      'Mijloace de producție 3',
      'Executant 1',
    ]);
    const rows = screen.getAllByTestId('risk-factor-row');
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Lovire de piese în mișcare',
      'Tăiere cu scule de mână',
      'Electrocutare prin atingere indirectă',
      'Neutilizarea echipamentului de protecție',
    ]);
    expect(rows.map((row) => within(row).getByTestId('risk-component').textContent)).toEqual([
      'Mijloace de producție',
      'Mijloace de producție',
      'Mijloace de producție',
      'Executant',
    ]);
    expect(rows.map((row) => within(row).getByTestId('risk-group').textContent)).toEqual([
      'factori de risc mecanic',
      'factori de risc mecanic',
      'factori de risc electric',
      'acțiuni greșite',
    ]);
  });

  it('shows the classes with their meaning, the level with the unacceptable ones marked, and the measures', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const rows = await screen.findAllByTestId('risk-factor-row');
    const [moving, cutsRow, electricRow, carelessRow] = rows;
    const gravity = within(moving!).getByTestId('risk-factor-gravity-class');
    expect(gravity.textContent).toBe('Gravitate 4Invaliditate gradul III');
    expect(gravity.title).toBe('Invaliditate gradul III');
    expect(within(moving!).getByTestId('risk-factor-probability-class').textContent).toBe(
      'Probabilitate 5o dată la 1 lună – 1 an'
    );
    expect(within(moving!).getByTestId('risk-level').textContent).toBe('Nivel 5, inacceptabil');
    expect(within(moving!).getByTestId('risk-factor-measures').textContent).toBe('o măsură');
    expect(within(moving!).queryByTestId('risk-factor-gap')).toBeNull();
    expect(within(cutsRow!).getByTestId('risk-factor-measures').textContent).toBe('Fără măsuri');
    expect(within(cutsRow!).queryByTestId('risk-factor-gap')).toBeNull();
    expect(within(electricRow!).queryByTestId('risk-factor-measures')).toBeNull();
    expect(within(electricRow!).getByTestId('risk-factor-gap').textContent).toBe(
      'Fără măsuriUn factor inacceptabil are nevoie de cel puțin o măsură de prevenire.'
    );
    expect(within(carelessRow!).getByTestId('risk-level').textContent).toBe('Nivel 3');
    expect(within(carelessRow!).getByTestId('risk-level').dataset.unacceptable).toBeUndefined();
  });

  it('sorts by a column: ascending, descending, then back to the order of the sheet', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-factor-row');
    const order = () =>
      screen.getAllByTestId('risk-factor-row').map((row) => row.querySelector('p')?.textContent);
    const levelHeader = screen.getByTestId('risk-factors-sort-level');
    const sorted = () => levelHeader.closest('[role="columnheader"]')?.getAttribute('aria-sort');

    await user.click(levelHeader);
    expect(sorted()).toBe('ascending');
    expect(order()).toEqual([
      'Tăiere cu scule de mână',
      'Neutilizarea echipamentului de protecție',
      'Electrocutare prin atingere indirectă',
      'Lovire de piese în mișcare',
    ]);
    await user.click(levelHeader);
    expect(sorted()).toBe('descending');
    expect(order()).toEqual([
      'Lovire de piese în mișcare',
      'Electrocutare prin atingere indirectă',
      'Neutilizarea echipamentului de protecție',
      'Tăiere cu scule de mână',
    ]);
    await user.click(levelHeader);
    expect(sorted()).toBe('none');
    expect(order()).toEqual([
      'Lovire de piese în mișcare',
      'Tăiere cu scule de mână',
      'Electrocutare prin atingere indirectă',
      'Neutilizarea echipamentului de protecție',
    ]);

    await user.selectOptions(screen.getByTestId('risk-factors-sort'), 'measures:asc');
    expect(order()).toEqual([
      'Tăiere cu scule de mână',
      'Electrocutare prin atingere indirectă',
      'Neutilizarea echipamentului de protecție',
      'Lovire de piese în mișcare',
    ]);
    expect(
      screen
        .getByTestId('risk-factors-sort-measures')
        .closest('[role="columnheader"]')
        ?.getAttribute('aria-sort')
    ).toBe('ascending');
  });

  it("shows one component's factors on its tab, with the group alone under each", async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-factor-row');
    const executant = screen.getByRole('tab', { name: 'Executant 1' });
    await user.click(executant);
    expect(executant.getAttribute('aria-selected')).toBe('true');
    const rows = screen.getAllByTestId('risk-factor-row');
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Neutilizarea echipamentului de protecție',
    ]);
    expect(within(rows[0]!).queryByTestId('risk-component')).toBeNull();
    expect(within(rows[0]!).getByTestId('risk-group').textContent).toBe('Acțiuni greșite');

    await user.click(screen.getByRole('tab', { name: 'Toți 4' }));
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(4);
  });

  it("filters the factors by a cell of the result's grid until the cell is clicked again", async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-factor-row');
    expect(screen.getAllByTestId('risk-matrix-cell')).toHaveLength(4);
    const cell = screen.getByRole('button', { name: 'Gravitate 7, probabilitate 2: 1 factor' });
    expect(cell.textContent).toBe('1');

    await user.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('risk-factors-filter').textContent).toContain(
      'Doar factorii cu gravitate 7 și probabilitate 2.'
    );
    expect(
      screen.getAllByTestId('risk-factor-row').map((row) => row.querySelector('p')?.textContent)
    ).toEqual(['Electrocutare prin atingere indirectă']);

    await user.click(screen.getByRole('tab', { name: 'Executant 1' }));
    expect(screen.queryAllByTestId('risk-factor-row')).toHaveLength(0);
    expect(screen.getByText('Niciun factor în această filă cu clasele alese.')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Toți 4' }));

    await user.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('risk-factors-filter')).toBeNull();
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(4);

    await user.click(cell);
    await user.click(
      within(screen.getByTestId('risk-factors-filter')).getByRole('button', { name: 'Arată toți' })
    );
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(4);
  });

  it('gives the global level, whether it is over the limit, and the shares per component', async () => {
    mockApi();
    mount(welderEvaluationPath);
    await screen.findByTestId('risk-result-card');
    expect(screen.getByTestId('risk-global-level').textContent).toBe('3,86');
    expect(screen.getByTestId('risk-global-verdict').textContent).toBe('Peste limita acceptabilă');
    expect(screen.getByTestId('risk-result-counts').textContent).toBe(
      '2 din 4 factori sunt inacceptabili.'
    );
    expect(screen.getAllByTestId('risk-share').map((share) => share.textContent)).toEqual([
      '75%',
      '0%',
      '25%',
      '0%',
    ]);
  });

  it('shows the work system, taking the task and the people from the position', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const card = await screen.findByTestId('work-system-card');
    expect(card.textContent).toContain('Sudură electrică și autogenă.');
    expect(card.textContent).toContain('3 angajați');
    expect(within(card).getByTestId('work-system-means').textContent).toBe(
      'Aparat de sudură, polizor unghiular.'
    );

    const user = userEvent.setup();
    await user.click(within(card).getByTestId('work-system-edit'));
    expect(screen.queryByTestId('work-system-workTask')).toBeNull();
    const environment = screen.getByTestId('work-system-workEnvironment');
    await user.clear(environment);
    await user.click(screen.getByTestId('work-system-save'));
    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${welderEvaluation.id}`, 'PATCH')).toEqual([
        {
          meansOfProduction: 'Aparat de sudură, polizor unghiular.',
          workEnvironment: null,
          exposure: '8 h / schimb',
        },
      ])
    );
    expect(await screen.findByText('Sistemul de muncă a fost salvat.')).toBeTruthy();
  });

  it('adds a factor with its measures, showing what the classes mean and the level they give', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    const dialog = await screen.findByTestId('risk-factor-dialog');
    expect(screen.getByTestId<HTMLSelectElement>('risk-factor-component').value).toBe(
      'means_of_production'
    );

    await user.click(screen.getByTestId('risk-factor-save'));
    expect(await within(dialog).findByText('Descrie forma concretă a factorului.')).toBeTruthy();
    expect(within(dialog).getByText('Alege clasa de gravitate.')).toBeTruthy();

    expect(
      [...screen.getByTestId<HTMLSelectElement>('risk-factor-gravity').options].map(
        (option) => option.textContent
      )
    ).toContain('7 – Deces');
    expect(
      [...screen.getByTestId<HTMLSelectElement>('risk-factor-probability').options].map(
        (option) => option.textContent
      )
    ).toContain('1 – Extrem de rare, o dată la peste 10 ani');

    await user.selectOptions(screen.getByTestId('risk-factor-component'), 'work_environment');
    const group = screen.getByTestId('risk-factor-group');
    await user.clear(group);
    await user.type(group, 'Factori de risc fizic');
    await user.type(screen.getByTestId('risk-factor-description'), 'Zgomot peste limită');
    await user.selectOptions(screen.getByTestId('risk-factor-gravity'), '3');
    await user.selectOptions(screen.getByTestId('risk-factor-probability'), '6');
    expect(screen.getByTestId('risk-factor-level').textContent).toContain('Nivel 4');
    expect(screen.getByTestId('risk-factor-level').dataset.unacceptable).toBe('true');

    await user.click(screen.getByTestId('risk-factor-measure-add'));
    await user.click(screen.getByTestId('risk-factor-measure-add'));
    const [first, second] = screen.getAllByTestId('risk-factor-measure');
    await user.type(within(first!).getByTestId('risk-factor-measure-description'), 'Antifoane');
    await user.selectOptions(
      within(second!).getByTestId('risk-factor-measure-kind'),
      'organizational'
    );
    await user.type(
      within(second!).getByTestId('risk-factor-measure-description'),
      'Pauze în spațiu liniștit'
    );
    await user.type(screen.getByTestId('risk-factor-deadline'), 'Permanent');
    await user.type(screen.getByTestId('risk-factor-responsible'), 'Șef atelier');
    await waitFor(() =>
      expect(requests('/risk-factor-suggestions', 'GET').length).toBeGreaterThan(0)
    );
    await user.click(screen.getByTestId('risk-factor-save'));

    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${welderEvaluation.id}/factors`, 'POST')).toEqual([
        {
          component: 'work_environment',
          group: 'Factori de risc fizic',
          description: 'Zgomot peste limită',
          gravityClass: 3,
          probabilityClass: 6,
          measures: [
            { kind: 'technical', description: 'Antifoane' },
            { kind: 'organizational', description: 'Pauze în spațiu liniștit' },
          ],
          actions: null,
          deadline: 'Permanent',
          responsiblePerson: 'Șef atelier',
          observations: null,
        },
      ])
    );
    expect(await screen.findByText('Factorul a fost adăugat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('risk-factor-dialog')).toBeNull());
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(5);
    expect(screen.getByTestId('risk-factors-count').textContent).toBe('5 factori');
  });

  it('edits a factor from its row and deletes another after asking', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('risk-factor-row');

    await user.click(within(rows[0]!).getByTestId('risk-factor-gravity-class'));
    await screen.findByTestId('risk-factor-dialog');
    expect(screen.getByTestId<HTMLSelectElement>('risk-factor-gravity').value).toBe('4');
    expect(
      screen.getAllByTestId<HTMLTextAreaElement>('risk-factor-measure-description')[0]!.value
    ).toBe('Apărători la piesele în mișcare');
    await user.selectOptions(screen.getByTestId('risk-factor-probability'), '2');
    await user.click(screen.getByTestId('risk-factor-save'));
    await waitFor(() =>
      expect(
        requests(`${evaluationsPath}/${welderEvaluation.id}/factors/${movingParts.id}`, 'PUT')
      ).toHaveLength(1)
    );
    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('risk-factor-row')[0]!).getByTestId('risk-level').textContent
      ).toBe('Nivel 3')
    );

    await user.click(
      within(screen.getAllByTestId('risk-factor-row')[1]!).getByTestId('risk-factor-actions')
    );
    await user.click(await screen.findByTestId('risk-factor-remove'));
    expect((await screen.findByTestId('risk-factor-remove-dialog')).textContent).toContain(
      'Tăiere cu scule de mână'
    );
    await user.click(screen.getByTestId('risk-factor-remove-confirm'));
    await waitFor(() => expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(3));
    expect(
      requests(`${evaluationsPath}/${welderEvaluation.id}/factors/${cuts.id}`, 'DELETE')
    ).toHaveLength(1);
  });

  it("copies the factors of another of the client's evaluations", async () => {
    mockApi();
    mount(`${positionsPath}/${cashier.id}/risk-evaluation`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factors-copy'));
    const source = await screen.findByTestId<HTMLSelectElement>('risk-factors-copy-source');
    await waitFor(() => expect(source.options).toHaveLength(3));
    expect([...source.options].map((option) => option.textContent)).toEqual([
      'Alege o evaluare…',
      'Sudor (4 factori)',
      'Vizitatori (un factor)',
    ]);
    await user.selectOptions(source, welderEvaluation.id);
    await user.click(screen.getByTestId('risk-factors-copy-confirm'));
    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${cashierEvaluation.id}/factors/copy`, 'POST')).toEqual([
        { fromEvaluationId: welderEvaluation.id },
      ])
    );
    expect(await screen.findByText('Evaluarea are acum 4 factori.')).toBeTruthy();
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(4);
  });

  it('deletes the evaluation after asking, and goes back to the position', async () => {
    mockApi();
    const runtime = mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-evaluation-remove'));
    expect((await screen.findByTestId('risk-evaluation-remove-dialog')).textContent).toContain(
      '4 factori și măsurile lor se șterg odată cu ea.'
    );
    await user.click(screen.getByTestId('risk-evaluation-remove-confirm'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(welderPath));
    expect(requests(`${evaluationsPath}/${welderEvaluation.id}`, 'DELETE')).toHaveLength(1);
    expect(runtime.router.state.location.hash).toBe('risk-evaluation');
    expect((await screen.findByTestId('position-risk-state')).textContent).toBe('Neevaluat');
  });

  it('is read-only for an archived client', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount(welderEvaluationPath);
    expect(await screen.findAllByTestId('risk-factor-row')).toHaveLength(4);
    expect(screen.queryByTestId('risk-factor-add')).toBeNull();
    expect(screen.queryByTestId('risk-factors-copy')).toBeNull();
    expect(screen.queryByTestId('risk-factor-actions')).toBeNull();
    expect(screen.queryByTestId('work-system-edit')).toBeNull();
    expect(screen.queryByTestId('risk-evaluation-remove')).toBeNull();
    expect(screen.queryByTestId('risk-factor-gap')).toBeNull();
  });
});

describe('the factor editor', () => {
  const phoneScreen = () => {
    const media = window.matchMedia;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media(query), matches: query === '(max-width: 767px)' }))
    );
  };

  async function fillFactor(user: ReturnType<typeof userEvent.setup>, description: string) {
    await user.type(screen.getByTestId('risk-factor-description'), description);
    await user.selectOptions(screen.getByTestId('risk-factor-gravity'), '3');
    await user.selectOptions(screen.getByTestId('risk-factor-probability'), '6');
  }

  it('opens beside the list on a wide screen, with the box to add another unticked', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    const editor = await screen.findByTestId('risk-factor-dialog');
    expect(editor.dataset.slot).toBe('sheet-content');
    expect(within(editor).getByRole('heading', { name: 'Factor nou' })).toBeTruthy();
    expect(within(editor).getByRole('button', { name: 'Renunță' })).toBeTruthy();
    expect(within(editor).getByTestId('risk-factor-add-another').getAttribute('aria-checked')).toBe(
      'false'
    );
    expect(within(editor).getByTestId('risk-factor-save').textContent).toBe('Adaugă');
  });

  it('opens as a drawer from the bottom on a phone, closed from its header', async () => {
    phoneScreen();
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    const editor = await screen.findByTestId('risk-factor-dialog');
    expect(editor.dataset.slot).toBe('drawer-content');
    expect(within(editor).getByRole('heading', { name: 'Factor nou' })).toBeTruthy();
    expect(within(editor).getByTestId('risk-factor-add-another')).toBeTruthy();
    expect(within(editor).getByTestId('risk-factor-save').textContent).toBe('Adaugă');

    await fillFactor(user, 'Zgomot peste limită');
    await user.click(within(editor).getByTestId('risk-factor-save'));
    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${welderEvaluation.id}/factors`, 'POST')).toHaveLength(1)
    );
    await waitFor(() => expect(screen.queryByTestId('risk-factor-dialog')).toBeNull());

    await user.click(screen.getByTestId('risk-factor-add'));
    await user.click(
      within(await screen.findByTestId('risk-factor-dialog')).getByRole('button', {
        name: 'Renunță',
      })
    );
    await waitFor(() => expect(screen.queryByTestId('risk-factor-dialog')).toBeNull());
  });

  it('with the box ticked, stays open for the next factor, keeping the component and the group', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    const editor = await screen.findByTestId('risk-factor-dialog');
    await user.click(within(editor).getByTestId('risk-factor-add-another'));

    await user.selectOptions(screen.getByTestId('risk-factor-component'), 'work_environment');
    const group = screen.getByTestId('risk-factor-group');
    await user.clear(group);
    await user.type(group, 'Fizici');
    await fillFactor(user, 'Zgomot');
    await user.click(screen.getByTestId('risk-factor-measure-add'));
    await user.type(screen.getByTestId('risk-factor-measure-description'), 'Căști');
    await user.type(screen.getByTestId('risk-factor-deadline'), 'Zilnic');
    await user.type(screen.getByTestId('risk-factor-responsible'), 'Șef');
    await user.click(screen.getByTestId('risk-factor-save'));

    expect(
      await screen.findByText('Factorul a fost adăugat. Completează-l pe următorul.')
    ).toBeTruthy();
    const description = screen.getByTestId<HTMLTextAreaElement>('risk-factor-description');
    await waitFor(() => expect(document.activeElement).toBe(description));
    expect(screen.getByTestId('risk-factor-dialog')).toBe(editor);
    expect(screen.getByTestId<HTMLSelectElement>('risk-factor-component').value).toBe(
      'work_environment'
    );
    expect(screen.getByTestId<HTMLInputElement>('risk-factor-group').value).toBe('Fizici');
    expect(description.value).toBe('');
    expect(screen.getByTestId<HTMLSelectElement>('risk-factor-gravity').value).toBe('');
    expect(screen.queryAllByTestId('risk-factor-measure')).toHaveLength(0);
    expect(screen.getByTestId<HTMLInputElement>('risk-factor-deadline').value).toBe('');
    expect(screen.queryByTestId('risk-factor-description-error')).toBeNull();
    expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(5);

    await fillFactor(user, 'Lumină');
    await user.click(screen.getByTestId('risk-factor-save'));
    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${welderEvaluation.id}/factors`, 'POST')).toHaveLength(2)
    );
    expect(requests(`${evaluationsPath}/${welderEvaluation.id}/factors`, 'POST')[1]).toMatchObject({
      component: 'work_environment',
      group: 'Fizici',
      description: 'Lumină',
      measures: [],
    });
    await waitFor(() => expect(screen.getAllByTestId('risk-factor-row')).toHaveLength(6));
    expect(screen.getByTestId('risk-factor-dialog')).toBe(editor);

    await user.click(within(editor).getByRole('button', { name: 'Renunță' }));
    await waitFor(() => expect(screen.queryByTestId('risk-factor-dialog')).toBeNull());
    await user.click(screen.getByTestId('risk-factor-add'));
    expect(
      (await screen.findByTestId('risk-factor-add-another')).getAttribute('aria-checked')
    ).toBe('true');
  });

  it('starts with the box unticked when the browser keeps no storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    const box = await screen.findByTestId('risk-factor-add-another');
    expect(box.getAttribute('aria-checked')).toBe('false');
    await user.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    vi.restoreAllMocks();
  });

  it('edits a factor without the box to add another', async () => {
    mockApi();
    mount(welderEvaluationPath);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('risk-factor-row');
    await user.click(within(rows[0]!).getByTestId('risk-factor-actions'));
    await user.click(await screen.findByTestId('risk-factor-edit'));
    const editor = await screen.findByTestId('risk-factor-dialog');
    expect(within(editor).getByRole('heading', { name: 'Modifică factorul' })).toBeTruthy();
    expect(within(editor).queryByTestId('risk-factor-add-another')).toBeNull();
    expect(within(editor).getByTestId('risk-factor-save').textContent).toBe('Salvează');
  });
});

describe("a client's evaluations outside its positions", () => {
  it('starts the sensitive groups evaluation and opens it', async () => {
    mockApi();
    const runtime = mount(positionsPath);
    const card = await screen.findByTestId('client-risk-evaluations-card');
    const rows = await within(card).findAllByTestId('client-risk-evaluation-row');
    expect(rows.map((row) => row.firstChild?.textContent)).toEqual([
      'Grupuri sensibile',
      'Vizitatori',
    ]);
    expect(within(rows[1]!).getByTestId('client-risk-evaluation-state').getAttribute('href')).toBe(
      `${positionsPath}/risk-evaluations/${visitors.id}`
    );

    await userEvent.setup().click(within(card).getByTestId('sensitive-groups-start'));
    await waitFor(() =>
      expect(requests(evaluationsPath, 'POST')).toEqual([{ kind: 'sensitive_groups' }])
    );
    await screen.findByTestId('risk-evaluation-page');
    expect(runtime.router.state.location.pathname).toMatch(
      new RegExp(`^${positionsPath}/risk-evaluations/[0-9a-f-]+$`)
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Grupuri sensibile' })).toBeTruthy();
  });

  it('adds one by name, and puts a name the client already uses on the field', async () => {
    mockApi({
      create: () =>
        Response.json(
          { error: 'conflict', message: 'taken', reason: 'risk_evaluation_name_taken' },
          { status: 409 }
        ),
    });
    mount(positionsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('client-risk-evaluation-add'));
    await user.type(await screen.findByTestId('client-risk-evaluation-name'), 'Vizitatori');
    await user.click(screen.getByTestId('client-risk-evaluation-save'));
    await waitFor(() =>
      expect(requests(evaluationsPath, 'POST')).toEqual([{ kind: 'other', name: 'Vizitatori' }])
    );
    expect((await screen.findByTestId('client-risk-evaluation-name-error')).textContent).toBe(
      'Clientul are deja o evaluare cu această denumire.'
    );
    expect(screen.getByTestId('client-risk-evaluation-dialog')).toBeTruthy();
  });

  it('records the work task, the people exposed and the name of its own', async () => {
    mockApi();
    mount(`${positionsPath}/risk-evaluations/${visitors.id}`);
    const card = await screen.findByTestId('work-system-card');
    expect(screen.getByRole('heading', { level: 2, name: 'Vizitatori' })).toBeTruthy();
    expect(within(card).getByTestId('work-system-exposed-persons').textContent).toBe(
      'Min. 3 persoane'
    );
    const current = screen
      .getAllByTestId('client-section')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Posturi de lucru']);

    const user = userEvent.setup();
    await user.click(within(card).getByTestId('work-system-edit'));
    const name = screen.getByTestId('work-system-name-input');
    await user.clear(name);
    await user.type(name, 'Vizitatori și curieri');
    await user.click(screen.getByTestId('work-system-save'));
    await waitFor(() =>
      expect(requests(`${evaluationsPath}/${visitors.id}`, 'PATCH')).toEqual([
        {
          meansOfProduction: 'Aparat de sudură, polizor unghiular.',
          workEnvironment: 'Atelier ventilat natural.',
          exposure: '8 h / schimb',
          workTask: 'Vizitează atelierul însoțiți.',
          exposedPersons: 'Min. 3 persoane',
          name: 'Vizitatori și curieri',
        },
      ])
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Vizitatori și curieri' })
    ).toBeTruthy();
  });

  it("sends a position's evaluation to its address under the position", async () => {
    mockApi();
    const runtime = mount(`${positionsPath}/risk-evaluations/${welderEvaluation.id}`);
    await screen.findByTestId('risk-evaluation-page');
    expect(runtime.router.state.location.pathname).toBe(welderEvaluationPath);
  });

  it('is not found for an evaluation the client does not have', async () => {
    mockApi();
    mount(`${positionsPath}/risk-evaluations/${uuid()}`);
    expect(await screen.findByTestId('risk-evaluation-not-found')).toBeTruthy();
  });
});

describe('the factor list', () => {
  it('puts the components in the order of the sheet and keeps the order inside them', () => {
    const overtime = { ...careless, id: 'f-overtime', component: 'work_task' as const };
    const sections = sectionsOf([overtime, careless, movingParts, electric, cuts]);
    expect(sections.map((section) => [section.component, section.count])).toEqual([
      ['means_of_production', 3],
      ['executant', 1],
      ['work_task', 1],
    ]);
    expect(sections[0]!.groups.map((group) => group.factors.map((factor) => factor.id))).toEqual([
      [movingParts.id, cuts.id],
      [electric.id],
    ]);
  });

  it('counts factors the Romanian way and words the state of an evaluation', () => {
    expect([0, 1, 2, 19, 20, 101, 120].map(factorCountLabel)).toEqual([
      'Niciun factor',
      'Un factor',
      '2 factori',
      '19 factori',
      '20 de factori',
      '101 factori',
      '120 de factori',
    ]);
    expect(evaluationStateLabel(null)).toBe('Neevaluat');
    expect(evaluationStateLabel({ factorCount: 0, globalRiskLevel: null })).toBe('Fără factori');
    expect(evaluationStateLabel({ factorCount: 1, globalRiskLevel: 2 })).toBe('1 factor · 2,00');
  });
});

describe('a failed change', () => {
  it('is put down to an archived client only when the API says so', () => {
    expect(evaluationFailure(new ApiHttpError(409, { reason: 'client_archived' }), 'Eroare.')).toBe(
      'Clientul este arhivat; evaluările lui nu se mai schimbă.'
    );
    expect(evaluationFailure(new ApiHttpError(409, { reason: 'other' }), 'Eroare.')).toBe(
      'Eroare.'
    );
  });
});
