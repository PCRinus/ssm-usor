import { evaluationGlobalRiskLevel, riskLevel } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  RiskEvaluation,
  RiskFactor,
} from '@/features/risk-evaluations/risk-evaluation-schema';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { type EvaluationProfile, profileCountLabel, profileTotalsLabel } from './profile-schema';

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

const accountant = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Contabil',
  staffCategory: 'execution',
  workZone: 'Birou',
  activities: 'Evidența contabilă.',
  trainingIntervalMonths: null as number | null,
  employeeCount: 2,
  needsProtectiveEquipment: false as boolean | null,
  equipmentCount: 0,
  needsInstructions: false as boolean | null,
  instructionCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const stamp = '2026-10-02T10:00:00.000Z';
let nextId = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;

function makeFactor(
  fields: Partial<RiskFactor> & Pick<RiskFactor, 'gravityClass' | 'probabilityClass'>
) {
  return {
    id: uuid(),
    component: 'means_of_production',
    group: 'Factori de risc electric',
    description: 'Factor',
    measures: [],
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    sourceProfile: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
    riskLevel: riskLevel(fields.gravityClass, fields.probabilityClass),
  } satisfies RiskFactor;
}

const electrocution = makeFactor({
  description: 'Electrocutare prin atingere indirectă',
  gravityClass: 5,
  probabilityClass: 2,
  measures: [{ id: uuid(), kind: 'technical', description: 'Verificarea împământării' }],
  deadline: 'Anual',
  responsiblePerson: 'Administratorul',
});
const screenWork = makeFactor({
  component: 'work_task',
  group: 'Suprasolicitare fizică',
  description: 'Lucru prelungit la monitor',
  gravityClass: 2,
  probabilityClass: 4,
});

function makeProfile(fields: Partial<EvaluationProfile> & Pick<EvaluationProfile, 'name'>) {
  const factors = fields.factors ?? [];
  return {
    id: uuid(),
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
  } satisfies EvaluationProfile;
}

const office = makeProfile({ name: 'Lucrător de birou', factors: [electrocution, screenWork] });
const driver = makeProfile({ name: 'Șofer' });

function makeEvaluation(fields: Partial<RiskEvaluation>): RiskEvaluation {
  const factors = fields.factors ?? [];
  return {
    id: uuid(),
    clientId,
    kind: 'job_position',
    jobPosition: { id: accountant.id, name: accountant.name },
    name: null,
    meansOfProduction: null,
    workEnvironment: null,
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

const accountantEvaluation = makeEvaluation({
  factors: [
    makeFactor({ description: 'Lovire de mobilier', gravityClass: 1, probabilityClass: 1 }),
  ],
});

const summaryOf = ({ factors, ...rest }: { factors: RiskFactor[] } & Record<string, unknown>) => ({
  ...rest,
  factorCount: factors.length,
  unacceptableFactorCount: factors.filter((factor) => factor.riskLevel > 3).length,
});

const positionsPath = `/clients/${clientId}/job-positions`;
const accountantEvaluationPath = `${positionsPath}/${accountant.id}/risk-evaluation`;
const evaluationsPath = `/clients/${clientId}/risk-evaluations`;

type Handler = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  profiles = [office, driver],
  evaluation = accountantEvaluation,
  client = sampleClient,
  usage = () => Response.json({ items: [] }),
  createProfile,
}: {
  profiles?: EvaluationProfile[];
  evaluation?: RiskEvaluation;
  client?: typeof sampleClient;
  usage?: (profileId: string) => Response | Promise<Response>;
  createProfile?: Handler;
} = {}) {
  const library = new Map(profiles.map((profile) => [profile.id, profile]));
  let current = evaluation;
  const answer = (profile: EvaluationProfile, status = 200) => {
    const recomputed = makeProfile(profile);
    library.set(recomputed.id, recomputed);
    return Response.json({ profile: recomputed }, { status });
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
    if (pathname === positionsPath) return Response.json({ items: [accountant] });
    if (pathname === '/risk-factor-suggestions') return Response.json({ items: [] });
    if (pathname === `${positionsPath}/${accountant.id}/risk-evaluation`) {
      return Response.json({ evaluation: current });
    }
    if (pathname === evaluationsPath) {
      return Response.json({ items: [summaryOf(current)] });
    }
    if (pathname === `${evaluationsPath}/${current.id}/save-as-profile`) {
      const saved = makeProfile({
        name: String(body.name),
        factors: current.factors.map((f) => ({ ...f, sourceProfile: null })),
      });
      const link = { id: saved.id, name: saved.name };
      current = makeEvaluation({
        ...current,
        factors: current.factors.map((f) => ({ ...f, sourceProfile: f.sourceProfile ?? link })),
      });
      return answer(saved, 201);
    }
    if (pathname === `${evaluationsPath}/${current.id}/factors/apply-profile`) {
      const profile = library.get(String(body.profileId))!;
      current = makeEvaluation({
        ...current,
        factors: [
          ...current.factors,
          ...profile.factors.map((f) => ({
            ...f,
            id: uuid(),
            sourceProfile: { id: profile.id, name: profile.name },
          })),
        ],
      });
      return Response.json({ evaluation: current, addedFactorCount: profile.factors.length });
    }
    if (pathname === '/evaluation-profiles') {
      if (method === 'POST') {
        return (createProfile ?? (() => answer(makeProfile({ name: String(body.name) }), 201)))(
          init
        );
      }
      return Response.json({ items: [...library.values()].map(summaryOf) });
    }
    const usageMatch = pathname.match(/^\/evaluation-profiles\/([^/]+)\/usage$/);
    if (usageMatch) return usage(usageMatch[1]!);
    const match = pathname.match(/^\/evaluation-profiles\/([^/]+)(?:\/factors(?:\/([^/]+))?)?$/);
    if (match) {
      const [, profileId, factorId] = match;
      const profile = library.get(profileId!);
      if (!profile) return Response.json({ error: 'not_found', message: 'no' }, { status: 404 });
      const factorsPath = pathname.endsWith('/factors') || factorId;
      if (!factorsPath) {
        if (method === 'DELETE') {
          library.delete(profile.id);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH') return answer({ ...profile, name: String(body.name) });
        return Response.json({ profile });
      }
      if (factorId && method === 'DELETE') {
        return answer({ ...profile, factors: profile.factors.filter((f) => f.id !== factorId) });
      }
      return answer({ ...profile, factors: [...profile.factors, toFactor(body)] }, 201);
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

describe('the risk library', () => {
  it('is a sidebar entry beside the instructions', async () => {
    mockApi();
    mount('/risks');
    await screen.findByTestId('risk-library');
    const entries = [...document.querySelectorAll('[data-testid^="nav-"]')].map((link) =>
      link.getAttribute('data-testid')
    );
    expect(entries.slice(entries.indexOf('nav-instructions')).slice(0, 2)).toEqual([
      'nav-instructions',
      'nav-risks',
    ]);
    expect(screen.getByTestId('nav-risks').textContent).toBe('Riscuri');
    expect(screen.getByTestId('nav-risks').getAttribute('aria-current')).toBe('page');
  });

  it('explains how profiles come to exist while it is empty', async () => {
    mockApi({ profiles: [] });
    mount('/risks');
    const empty = await screen.findByTestId('risk-library-empty');
    expect(empty.textContent).toContain('Salvează în bibliotecă');
    expect(empty.textContent).toContain('Profil nou');
  });

  it('lists the profiles with their factors and global level', async () => {
    mockApi();
    mount('/risks');
    const rows = await screen.findAllByTestId('risk-profile-row');
    expect(rows.map((row) => within(row).getByTestId('risk-profile-open').textContent)).toEqual([
      'Lucrător de birou',
      'Șofer',
    ]);
    const cells = (row: HTMLElement) =>
      ['risk-profile-factors', 'risk-profile-unacceptable', 'risk-profile-level'].map(
        (testId) => within(row).getByTestId(testId).textContent
      );
    expect(cells(rows[0]!)).toEqual(['2', '1', '3,33']);
    expect(cells(rows[1]!)).toEqual(['0', '0', '—']);
    expect(screen.getByTestId('risk-library-count').textContent).toBe('2 profiluri');
  });

  it('counts profiles the Romanian way', () => {
    expect([1, 2, 19, 20, 101, 120].map(profileCountLabel)).toEqual([
      '1 profil',
      '2 profiluri',
      '19 profiluri',
      '20 de profiluri',
      '101 profiluri',
      '120 de profiluri',
    ]);
  });

  it('starts a profile by name and opens it', async () => {
    mockApi();
    const runtime = mount('/risks');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-new'));
    await user.type(await screen.findByTestId('profile-name'), 'Casier');
    await user.click(screen.getByTestId('profile-name-submit'));
    await screen.findByTestId('risk-profile-page');
    expect(requests('/evaluation-profiles', 'POST')).toEqual([{ name: 'Casier' }]);
    expect(runtime.router.state.location.pathname).toMatch(/^\/risks\/[0-9a-f-]+$/);
    expect(screen.getByRole('heading', { level: 1, name: 'Casier' })).toBeTruthy();
    expect(screen.getByTestId('risk-factors-empty')).toBeTruthy();
  });

  it('puts a name the library already holds on the field', async () => {
    mockApi({
      createProfile: () =>
        Response.json(
          {
            error: 'conflict',
            message: 'taken',
            reason: 'evaluation_profile_name_taken',
            issues: [{ path: 'name', message: 'taken' }],
          },
          { status: 409 }
        ),
    });
    mount('/risks');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-new'));
    await user.type(await screen.findByTestId('profile-name'), 'lucrător de birou');
    await user.click(screen.getByTestId('profile-name-submit'));
    expect(await screen.findByText(/Biblioteca are deja un profil/)).toBeTruthy();
    expect(screen.getByTestId('profile-name-dialog')).toBeTruthy();
  });

  it('renames a profile from its row', async () => {
    mockApi();
    mount('/risks');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('risk-profile-row');
    await user.click(within(row!).getByTestId('risk-profile-actions'));
    await user.click(await screen.findByTestId('risk-profile-rename'));
    const name = await screen.findByTestId('profile-name');
    await user.clear(name);
    await user.type(name, 'Birou');
    await user.click(screen.getByTestId('profile-name-submit'));
    await waitFor(() =>
      expect(requests(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([{ name: 'Birou' }])
    );
  });
});

describe('a profile page', () => {
  it('shows the result and the factors with the evaluation page’s own card', async () => {
    mockApi();
    mount(`/risks/${office.id}`);
    await screen.findByTestId('risk-profile-page');
    expect(screen.getByTestId('risk-global-level').textContent).toBe('3,33');
    expect(screen.getByTestId('risk-result-counts').textContent).toBe(
      'Unul din 2 factori este inacceptabil.'
    );
    expect(
      screen.getAllByTestId('risk-factor-row').map((row) => row.querySelector('p')?.textContent)
    ).toEqual(['Electrocutare prin atingere indirectă', 'Lucru prelungit la monitor']);
    expect(screen.queryByTestId('risk-factors-copy')).toBeNull();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByText('Lucrător de birou')).toBeTruthy();
  });

  it('adds a factor with the evaluation page’s dialog', async () => {
    mockApi();
    mount(`/risks/${driver.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    await screen.findByTestId('risk-factor-dialog');
    await user.selectOptions(screen.getByTestId('risk-factor-component'), 'work_environment');
    await user.type(screen.getByTestId('risk-factor-group'), 'Factori de risc fizic');
    await user.type(screen.getByTestId('risk-factor-description'), 'Vibrații la volan');
    await user.selectOptions(screen.getByTestId('risk-factor-gravity'), '2');
    await user.selectOptions(screen.getByTestId('risk-factor-probability'), '5');
    await user.click(screen.getByTestId('risk-factor-save'));
    await waitFor(() =>
      expect(requests(`/evaluation-profiles/${driver.id}/factors`, 'POST')).toEqual([
        {
          component: 'work_environment',
          group: 'Factori de risc fizic',
          description: 'Vibrații la volan',
          gravityClass: 2,
          probabilityClass: 5,
          measures: [],
          actions: null,
          deadline: null,
          responsiblePerson: null,
          observations: null,
        },
      ])
    );
    expect(await screen.findByText('Vibrații la volan')).toBeTruthy();
    expect(screen.getByTestId('risk-factors-count').textContent).toBe('Un factor');
  });

  it('deletes the profile after asking, and goes back to the library', async () => {
    mockApi();
    const runtime = mount(`/risks/${office.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-remove'));
    const dialog = await screen.findByTestId('risk-profile-remove-dialog');
    expect(dialog.textContent).toContain('împreună cu cei 2 factori ai săi');
    expect(dialog.textContent).toContain('își păstrează factorii copiați');
    await user.click(within(dialog).getByTestId('risk-profile-remove-confirm'));
    await screen.findByTestId('risk-library');
    expect(requests(`/evaluation-profiles/${office.id}`, 'DELETE')).toHaveLength(1);
    expect(runtime.router.state.location.pathname).toBe('/risks');
    expect(
      (await screen.findAllByTestId('risk-profile-open')).map((link) => link.textContent)
    ).toEqual(['Șofer']);
  });

  it('lists the evaluations that use the profile, by client', async () => {
    const otherClientId = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const profileUse = (fields: Record<string, unknown>) => ({
      id: uuid(),
      clientId,
      clientName: 'VELOCE CAFE SRL',
      clientArchivedAt: null,
      kind: 'job_position',
      jobPosition: null,
      name: null,
      linkedFactorCount: 1,
      ...fields,
    });
    const accountantUse = profileUse({
      jobPosition: { id: accountant.id, name: accountant.name },
      linkedFactorCount: 2,
    });
    const visitorsUse = profileUse({ kind: 'other', name: 'Vizitatori' });
    mockApi({
      usage: () =>
        Response.json({
          items: [
            profileUse({
              clientId: otherClientId,
              clientName: 'ALFA SRL',
              clientArchivedAt: '2026-09-18T10:00:00+00:00',
              kind: 'sensitive_groups',
              linkedFactorCount: 12,
            }),
            accountantUse,
            visitorsUse,
          ],
        }),
    });
    mount(`/risks/${office.id}`);
    const usage = await screen.findByTestId('risk-profile-usage');
    const clients = await within(usage).findAllByTestId('risk-profile-usage-client');
    expect(within(usage).getByTestId('risk-profile-usage-count').textContent).toBe('3 evaluări');
    expect(clients).toHaveLength(2);
    expect(within(clients[0]!).getByTestId('risk-profile-usage-archived')).toBeTruthy();
    expect(within(clients[1]!).queryByTestId('risk-profile-usage-archived')).toBeNull();
    const rows = within(clients[1]!).getAllByTestId('risk-profile-usage-row');
    expect(
      rows.map((row) => [
        within(row).getByTestId('risk-profile-usage-open').textContent,
        within(row).getByTestId('risk-profile-usage-factors').textContent,
      ])
    ).toEqual([
      ['Contabil', '2 factori din profil'],
      ['Vizitatori', 'Un factor din profil'],
    ]);
    expect(within(rows[0]!).getByTestId('risk-profile-usage-open').getAttribute('href')).toBe(
      accountantEvaluationPath
    );
    expect(within(rows[1]!).getByTestId('risk-profile-usage-open').getAttribute('href')).toBe(
      `${positionsPath}/risk-evaluations/${visitorsUse.id}`
    );
  });

  it('says how a profile comes to be used while no evaluation uses it', async () => {
    mockApi();
    mount(`/risks/${office.id}`);
    const empty = await screen.findByTestId('risk-profile-usage-empty');
    expect(empty.textContent).toContain('nu este folosit încă la niciun client');
    expect(empty.textContent).toContain('„Aplică un profil”');
  });

  it('offers to retry when the evaluations using the profile do not load', async () => {
    let failing = true;
    mockApi({
      usage: () =>
        failing
          ? Response.json({ error: 'forbidden', message: 'no' }, { status: 403 })
          : Response.json({ items: [] }),
    });
    mount(`/risks/${office.id}`);
    const user = userEvent.setup();
    const error = await screen.findByTestId('risk-profile-usage-error');
    failing = false;
    await user.click(within(error).getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('risk-profile-usage-empty')).toBeTruthy();
  });

  it('is not found for a profile the library does not hold', async () => {
    mockApi();
    mount(`/risks/${uuid()}`);
    expect(await screen.findByTestId('risk-profile-not-found')).toBeTruthy();
  });
});

describe('an evaluation and the library', () => {
  it('invites saving a hand-typed evaluation into the library, under the position’s name', async () => {
    mockApi();
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    const nudge = await screen.findByTestId('risk-library-nudge');
    expect(nudge.textContent).toContain('Factorii nu sunt încă în biblioteca de riscuri.');
    expect(screen.queryByTestId('risk-evaluation-save-as-profile')).toBeNull();
    await user.click(within(nudge).getByTestId('risk-library-nudge-save'));
    const dialog = await screen.findByTestId('profile-name-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Salvează în bibliotecă');
    expect(within(dialog).getByTestId<HTMLInputElement>('profile-name').value).toBe('Contabil');
    await user.click(within(dialog).getByTestId('profile-name-submit'));
    await waitFor(() =>
      expect(
        requests(`${evaluationsPath}/${accountantEvaluation.id}/save-as-profile`, 'POST')
      ).toEqual([{ name: 'Contabil' }])
    );
    expect(await screen.findByText(/Profilul „Contabil” a fost salvat/)).toBeTruthy();
    expect((await screen.findByTestId('risk-factors-origin')).textContent).toBe(
      'Factorul este în profilul Contabil.'
    );
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.getByTestId('risk-evaluation-save-as-profile').textContent).toBe(
      'Salvează în bibliotecă…'
    );
  });

  it('keeps the invitation away from an evaluation once dismissed', async () => {
    mockApi();
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-library-nudge-dismiss'));
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.getByTestId('risk-evaluation-save-as-profile')).toBeTruthy();
    disposeRuntimes();
    mount(accountantEvaluationPath);
    await screen.findByTestId('risk-evaluation-save-as-profile');
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
  });

  it('does not invite saving once any factor is in the library', async () => {
    mockApi({
      evaluation: makeEvaluation({
        factors: [
          makeFactor({ description: 'Lovire de mobilier', gravityClass: 1, probabilityClass: 1 }),
          makeFactor({
            description: 'Electrocutare',
            gravityClass: 5,
            probabilityClass: 2,
            sourceProfile: { id: office.id, name: office.name },
          }),
        ],
      }),
    });
    mount(accountantEvaluationPath);
    expect((await screen.findByTestId('risk-factors-origin')).textContent).toBe(
      'Un factor este în profilul Lucrător de birou; celălalt nu este în bibliotecă.'
    );
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.getByTestId('risk-evaluation-save-as-profile')).toBeTruthy();
  });

  it('does not invite saving under an archived client, which can still save from the header', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount(accountantEvaluationPath);
    await screen.findByTestId('risk-evaluation-save-as-profile');
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.queryByTestId('risk-factors-origin')).toBeNull();
  });

  it('names the one profile all the factors are in once, above the rows', async () => {
    const link = { id: office.id, name: office.name };
    mockApi({
      evaluation: makeEvaluation({
        factors: [
          makeFactor({
            description: 'Unu',
            gravityClass: 1,
            probabilityClass: 1,
            sourceProfile: link,
          }),
          makeFactor({
            description: 'Doi',
            gravityClass: 2,
            probabilityClass: 1,
            sourceProfile: link,
          }),
        ],
      }),
    });
    mount(accountantEvaluationPath);
    const summary = await screen.findByTestId('risk-factors-origin');
    expect(summary.textContent).toBe('Ambii factori sunt în profilul Lucrător de birou.');
    expect(within(summary).getByRole('link').getAttribute('href')).toBe(`/risks/${office.id}`);
    expect(screen.queryByTestId('risk-factor-origin')).toBeNull();
  });

  it('shows the profile each factor is in, and nothing on a hand-typed one', async () => {
    const linked = makeFactor({
      description: 'Electrocutare',
      gravityClass: 5,
      probabilityClass: 2,
      sourceProfile: { id: office.id, name: office.name },
    });
    mockApi({
      evaluation: makeEvaluation({
        factors: [
          linked,
          makeFactor({ description: 'Lovire de mobilier', gravityClass: 1, probabilityClass: 1 }),
        ],
      }),
    });
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    const [first, second] = await screen.findAllByTestId('risk-factor-row');
    const origin = within(first!).getByTestId('risk-factor-origin');
    expect(origin.textContent).toBe('În profilul Lucrător de birou');
    expect(within(origin).getByRole('link').getAttribute('href')).toBe(`/risks/${office.id}`);
    expect(within(second!).queryByTestId('risk-factor-origin')).toBeNull();
    await user.click(within(first!).getByTestId('risk-factor-actions'));
    await user.click(await screen.findByTestId('risk-factor-edit'));
    const dialog = await screen.findByTestId('risk-factor-dialog');
    expect(within(dialog).getByTestId('risk-factor-dialog-origin').textContent).toBe(
      'Factorul este și în profilul „Lucrător de birou”. Ce schimbi aici nu ajunge în profil.'
    );
  });

  it('offers no saving for an evaluation without factors', async () => {
    mockApi({ evaluation: makeEvaluation({ factors: [] }) });
    mount(accountantEvaluationPath);
    await screen.findByTestId('risk-factors-empty');
    expect(screen.queryByTestId('risk-evaluation-save-as-profile')).toBeNull();
    expect(screen.getByTestId('risk-factors-empty').textContent).toContain('aplică un profil');
  });

  it('applies a profile with factors, adds its factors after the others and says how many', async () => {
    mockApi();
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factors-apply-profile'));
    const dialog = await screen.findByTestId('apply-profile-dialog');
    const options = await within(dialog).findAllByTestId('apply-profile-option');
    expect(options.map((option) => option.textContent)).toEqual([
      `Lucrător de birou${profileTotalsLabel({ factorCount: 2, unacceptableFactorCount: 1 })}Nivel global 3,33`,
    ]);
    expect(within(dialog).getByTestId<HTMLButtonElement>('apply-profile-confirm').disabled).toBe(
      true
    );
    await user.click(within(options[0]!).getByRole('radio'));
    await user.click(within(dialog).getByTestId('apply-profile-confirm'));
    await waitFor(() =>
      expect(
        requests(`${evaluationsPath}/${accountantEvaluation.id}/factors/apply-profile`, 'POST')
      ).toEqual([{ profileId: office.id }])
    );
    expect(
      await screen.findByText('2 factori din „Lucrător de birou” au fost adăugați în evaluare.')
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('risk-factors-count').textContent).toBe('3 factori')
    );
    expect(screen.getByText('Lucru prelungit la monitor')).toBeTruthy();
  });

  it('says how a profile comes to exist when the library has none with factors', async () => {
    mockApi({ profiles: [driver] });
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factors-apply-profile'));
    const none = await screen.findByTestId('apply-profile-none');
    expect(none.textContent).toContain('Salvează în bibliotecă');
    expect(within(none).getByRole('link', { name: 'Riscuri' }).getAttribute('href')).toBe('/risks');
  });
});
