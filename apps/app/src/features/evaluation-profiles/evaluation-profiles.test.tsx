import { evaluationGlobalRiskLevel, riskLevel } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  ClientDocumentDetailsResponse,
  ResponsiblePersonListResponse,
} from '@/api/generated/api';
import type {
  RiskEvaluation,
  RiskFactor,
} from '@/features/risk-evaluations/risk-evaluation-schema';
import { bodiesOf, fetchMock, installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  documentDetailsRecord,
  jobPositionRecord,
  pageOf,
} from '@/test/records';

import { type EvaluationProfile, profileTotalsLabel } from './profile-schema';

const sampleClient = clientRecord();

const accountant = jobPositionRecord({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Contabil',
  workZone: 'Birou',
  activities: 'Evidența contabilă.',
  employeeCount: 2,
  needsProtectiveEquipment: false,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

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
    archivedAt: null,
    inUse: false,
    meansOfProduction: null,
    workEnvironment: null,
    exposure: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
  } satisfies EvaluationProfile;
}

const office = makeProfile({
  name: 'Lucrător de birou',
  factors: [electrocution, screenWork],
  inUse: true,
});
const driver = makeProfile({ name: 'Șofer' });
const usages = new Map([[office.id, { sheetCount: 5, clientCount: 3 }]]);

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

const profileSummaryOf = (profile: EvaluationProfile) => ({
  ...summaryOf(profile),
  ...(usages.get(profile.id) ?? { sheetCount: 0, clientCount: 0 }),
});

const collator = new Intl.Collator('ro');
const byName = (a: EvaluationProfile, b: EvaluationProfile) => collator.compare(a.name, b.name);

const conflict = (reason: string) =>
  Response.json({ error: 'conflict', message: 'no', reason }, { status: 409 });

const positionsPath = `/clients/${clientId}/job-positions`;
const positionsPage = `/clienti/${clientId}/posturi`;
const accountantEvaluationPath = `${positionsPage}/${accountant.id}/fisa-de-evaluare`;
const evaluationsPath = `/clients/${clientId}/risk-evaluations`;

type Handler = (init: RequestInit | undefined) => Response;

function mockProfilesApi({
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

  mockApi((init, url) => {
    const { pathname } = url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({
        documentDetails: documentDetailsRecord(),
      } satisfies ClientDocumentDetailsResponse);
    }
    if (pathname === `/clients/${clientId}/responsible-persons`) {
      return Response.json({ items: [] } satisfies ResponsiblePersonListResponse);
    }
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
      if (profile.archivedAt) return conflict('evaluation_profile_archived');
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
      const archived = url.searchParams.get('status') === 'archived';
      const tab = [...library.values()].filter(
        (profile) => (profile.archivedAt !== null) === archived
      );
      const q = url.searchParams.get('q')?.toLowerCase();
      const levels = url.searchParams.getAll('level');
      const unused = url.searchParams.getAll('usage').includes('unused');
      const levelOf = ({ globalRiskLevel: level, factors }: EvaluationProfile) =>
        factors.length === 0 ? 'none' : level !== null && level > 3.5 ? 'over' : 'within';
      const items = tab
        .filter(
          (profile) =>
            (!q || profile.name.toLowerCase().includes(q)) &&
            (levels.length === 0 || levels.includes(levelOf(profile))) &&
            (!unused || !usages.has(profile.id))
        )
        .sort(byName)
        .map(profileSummaryOf);
      if (url.searchParams.get('order') === 'desc') items.reverse();
      return Response.json({ ...pageOf(items), unfilteredTotal: tab.length });
    }
    if (pathname === '/evaluation-profiles/choices') {
      return Response.json({
        items: [...library.values()]
          .filter((profile) => profile.archivedAt === null && profile.factors.length > 0)
          .sort(byName)
          .map(profileSummaryOf),
      });
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
          if (profile.inUse) return conflict('evaluation_profile_in_use');
          library.delete(profile.id);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH') {
          return answer({
            ...profile,
            ...(body.name === undefined ? {} : { name: String(body.name) }),
            ...(body.archived === undefined ? {} : { archivedAt: body.archived ? stamp : null }),
            ...Object.fromEntries(
              (['meansOfProduction', 'workEnvironment', 'exposure'] as const)
                .filter((field) => body[field] !== undefined)
                .map((field) => [field, body[field] as string | null])
            ),
          });
        }
        return Response.json({ profile });
      }
      if (factorId && method === 'DELETE') {
        return answer({ ...profile, factors: profile.factors.filter((f) => f.id !== factorId) });
      }
      return answer({ ...profile, factors: [...profile.factors, toFactor(body)] }, 201);
    }
  });
}

const listQuery = (index = 0) =>
  new URL(String(requestsTo('/evaluation-profiles').at(index)![0])).searchParams;

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

installFetchMock();

describe('the risk library', () => {
  it('is a sidebar entry beside the instructions', async () => {
    mockProfilesApi();
    mount('/evaluari-de-risc');
    await screen.findByTestId('risk-library');
    const entries = [...document.querySelectorAll('[data-testid^="nav-"]')].map((link) =>
      link.getAttribute('data-testid')
    );
    expect(entries.slice(entries.indexOf('nav-instructions')).slice(0, 2)).toEqual([
      'nav-instructions',
      'nav-risks',
    ]);
    expect(screen.getByTestId('nav-risks').textContent).toBe('Evaluări de risc');
    expect(screen.getByTestId('nav-risks').getAttribute('aria-current')).toBe('page');
  });

  it('reads status=active in the address as the active tab', async () => {
    mockProfilesApi();
    mount('/evaluari-de-risc?status=active');
    await screen.findAllByTestId('risk-profile-row');
    expect(screen.getByTestId('risk-library-filter-active').getAttribute('aria-current')).toBe(
      'page'
    );
  });

  it('lists each entry with its global level, its factors under it, and where active clients use it', async () => {
    const crane = makeProfile({
      name: 'Macaragiu',
      factors: [
        makeFactor({ description: 'Cădere de sarcină', gravityClass: 7, probabilityClass: 6 }),
        makeFactor({ description: 'Strivire', gravityClass: 5, probabilityClass: 5 }),
        makeFactor({ description: 'Zgomot', gravityClass: 2, probabilityClass: 4 }),
      ],
    });
    mockProfilesApi({ profiles: [office, driver, crane] });
    mount('/evaluari-de-risc');
    const rows = await screen.findAllByTestId('risk-profile-row');
    expect(rows.map((row) => within(row).getByTestId('risk-profile-open').textContent)).toEqual([
      'Lucrător de birou',
      'Macaragiu',
      'Șofer',
    ]);
    const level = (row: HTMLElement) =>
      within(row).getByTestId('risk-profile-level').firstElementChild!;
    const factors = (row: HTMLElement) => within(row).getByTestId('risk-profile-factors');
    expect(level(rows[0]!).textContent).toBe('3,33');
    expect(level(rows[0]!).className).not.toContain('destructive');
    expect(factors(rows[0]!).textContent).toBe('2 factori, unul inacceptabil');
    expect(factors(rows[0]!).querySelector('.text-destructive-foreground')?.textContent).toBe(
      'unul inacceptabil'
    );
    expect(level(rows[1]!).textContent).toBe('5,57, peste limita acceptabilă');
    expect(level(rows[1]!).className).toContain('text-destructive-foreground');
    expect(factors(rows[1]!).textContent).toBe('3 factori, 2 inacceptabili');
    expect(within(rows[2]!).getByTestId('risk-profile-level').textContent).toBe('—Niciun factor');
    expect(within(rows[0]!).getByTestId('risk-profile-usage').textContent).toBe(
      '5 fișela 3 clienți'
    );
    expect(within(rows[2]!).getByTestId('risk-profile-usage').textContent).toBe('—');
    expect(screen.getByRole('columnheader', { name: 'Folosită la' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Factori' })).toBeNull();
    expect(screen.getByTestId('risk-library-count').textContent).toBe('3 evaluări');
    expect(screen.getByTestId('risk-library-filter-active').getAttribute('aria-current')).toBe(
      'page'
    );
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    const query = listQuery();
    expect(query.get('status')).toBeNull();
    expect(query.get('sort')).toBe('name');
    expect(query.get('order')).toBe('asc');
    expect(query.get('page')).toBe('1');
  });

  it('reads an entry with factors as having factors while its level is not stored yet', async () => {
    const unstored = makeProfile({
      name: 'Macaragiu',
      factors: [
        makeFactor({ description: 'Cădere de sarcină', gravityClass: 7, probabilityClass: 6 }),
        makeFactor({ description: 'Zgomot', gravityClass: 2, probabilityClass: 4 }),
      ],
    });
    mockProfilesApi({ profiles: [{ ...unstored, globalRiskLevel: null }] });
    mount('/evaluari-de-risc');
    const [row] = await screen.findAllByTestId('risk-profile-row');
    expect(within(row!).getByTestId('risk-profile-level').textContent).toBe(
      '—2 factori, unul inacceptabil'
    );
  });

  it('sorts by the columns the library can sort, in the URL and from the first page', async () => {
    mockProfilesApi();
    const runtime = mount('/evaluari-de-risc?page=2');
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-profile-row');
    expect(listQuery().get('page')).toBe('2');
    expect(
      ['name', 'globalRiskLevel', 'usage', 'updatedAt'].map(
        (id) => screen.queryByTestId(`sort-${id}`) !== null
      )
    ).toEqual([true, true, true, true]);
    expect(screen.queryByTestId('sort-unacceptable')).toBeNull();
    expect(screen.queryByTestId('sort-factorCount')).toBeNull();
    await user.click(screen.getByTestId('sort-globalRiskLevel'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        sort: 'globalRiskLevel',
        order: 'desc',
      })
    );
    await waitFor(() => expect(listQuery(-1).get('sort')).toBe('globalRiskLevel'));
    expect(listQuery(-1).get('order')).toBe('desc');
    expect(listQuery(-1).get('page')).toBe('1');
    await user.click(screen.getByTestId('sort-usage'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'usage', order: 'desc' })
    );
  });

  it('offers deleting only a profile no client uses, and archiving in any case', async () => {
    mockProfilesApi();
    mount('/evaluari-de-risc');
    const user = userEvent.setup();
    const [used, unused] = await screen.findAllByTestId('risk-profile-row');
    await user.click(within(used!).getByTestId('risk-profile-actions'));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Redenumește…',
      'Arhivează…',
    ]);
    expect(screen.queryByTestId('risk-profile-remove')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(within(unused!).getByTestId('risk-profile-actions'));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Redenumește…',
      'Arhivează…',
      'Șterge…',
    ]);
  });

  it('archives a profile in use after asking, shows it under Arhivate and reactivates it', async () => {
    mockProfilesApi();
    const runtime = mount('/evaluari-de-risc');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('risk-profile-row');
    await user.click(within(row!).getByTestId('risk-profile-actions'));
    await user.click(await screen.findByTestId('risk-profile-archive'));
    const dialog = await screen.findByTestId('risk-profile-archive-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Arhivezi evaluarea?');
    expect(dialog.textContent).toContain('nu mai apare în „Aplică din bibliotecă”');
    expect(dialog.textContent).toContain('fișele clienților care o folosesc nu se schimbă');
    expect(bodiesOf(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([]);
    await user.click(within(dialog).getByTestId('risk-profile-archive-confirm'));
    expect(await screen.findByText('„Lucrător de birou” a fost arhivată.')).toBeTruthy();
    expect(bodiesOf(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([{ archived: true }]);
    await waitFor(() =>
      expect(screen.getAllByTestId('risk-profile-open').map((link) => link.textContent)).toEqual([
        'Șofer',
      ])
    );

    await user.click(screen.getByTestId('risk-library-filter-archived'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ status: 'archived' })
    );
    await waitFor(() => expect(listQuery(-1).get('status')).toBe('archived'));
    const [archived] = await screen.findAllByTestId('risk-profile-row');
    expect(within(archived!).getByTestId('risk-profile-usage').textContent).toBe(
      '5 fișela 3 clienți'
    );
    await user.click(within(archived!).getByTestId('risk-profile-actions'));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Reactivează…',
    ]);
    await user.click(screen.getByTestId('risk-profile-restore'));
    const restore = await screen.findByTestId('risk-profile-archive-dialog');
    expect(within(restore).getByRole('heading').textContent).toBe('Reactivezi evaluarea?');
    await user.click(within(restore).getByTestId('risk-profile-archive-confirm'));
    expect(await screen.findByText('„Lucrător de birou” a fost reactivată.')).toBeTruthy();
    expect(bodiesOf(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([
      { archived: true },
      { archived: false },
    ]);
    expect((await screen.findByTestId('risk-library-empty')).textContent).toContain(
      'Nicio evaluare arhivată'
    );
  });

  it('says nothing of clients when archiving a profile none uses, and offers deleting it once archived', async () => {
    mockProfilesApi({ profiles: [office, makeProfile({ name: 'Casier' })] });
    mount('/evaluari-de-risc');
    const user = userEvent.setup();
    const [unused] = await screen.findAllByTestId('risk-profile-row');
    expect(within(unused!).getByTestId('risk-profile-open').textContent).toBe('Casier');
    await user.click(within(unused!).getByTestId('risk-profile-actions'));
    await user.click(await screen.findByTestId('risk-profile-archive'));
    const dialog = await screen.findByTestId('risk-profile-archive-dialog');
    expect(dialog.textContent).not.toContain('clienților');
    await user.click(within(dialog).getByTestId('risk-profile-archive-confirm'));
    await screen.findByText('„Casier” a fost arhivată.');

    await user.click(screen.getByTestId('risk-library-filter-archived'));
    await waitFor(() => expect(listQuery(-1).get('status')).toBe('archived'));
    const [archived] = await screen.findAllByTestId('risk-profile-row');
    expect(within(archived!).getByTestId('risk-profile-open').textContent).toBe('Casier');
    await user.click(within(archived!).getByTestId('risk-profile-actions'));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Reactivează…',
      'Șterge…',
    ]);
  });

  it('starts a profile by name and opens it', async () => {
    mockProfilesApi();
    const runtime = mount('/evaluari-de-risc');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-new'));
    await user.type(await screen.findByTestId('profile-name'), 'Casier');
    await user.click(screen.getByTestId('profile-name-submit'));
    await screen.findByTestId('risk-profile-page');
    expect(bodiesOf('/evaluation-profiles', 'POST')).toEqual([{ name: 'Casier' }]);
    expect(runtime.router.state.location.pathname).toMatch(/^\/evaluari-de-risc\/[0-9a-f-]+$/);
    expect(screen.getByRole('heading', { level: 1, name: 'Casier' })).toBeTruthy();
    expect(screen.getByTestId('risk-factors-empty')).toBeTruthy();
  });

  it('puts a name the library already holds on the field', async () => {
    mockProfilesApi({
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
    mount('/evaluari-de-risc');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-new'));
    await user.type(await screen.findByTestId('profile-name'), 'lucrător de birou');
    await user.click(screen.getByTestId('profile-name-submit'));
    expect(await screen.findByText(/Biblioteca are deja o evaluare/)).toBeTruthy();
    expect(screen.getByTestId('profile-name-dialog')).toBeTruthy();
  });

  it('renames a profile from its row', async () => {
    mockProfilesApi();
    mount('/evaluari-de-risc');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('risk-profile-row');
    await user.click(within(row!).getByTestId('risk-profile-actions'));
    await user.click(await screen.findByTestId('risk-profile-rename'));
    const name = await screen.findByTestId('profile-name');
    await user.clear(name);
    await user.type(name, 'Birou');
    await user.click(screen.getByTestId('profile-name-submit'));
    await waitFor(() =>
      expect(bodiesOf(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([{ name: 'Birou' }])
    );
  });
});

describe('a profile page', () => {
  it('shows the way back to the library while it loads', async () => {
    mockProfilesApi();
    const ownLibrary = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      new URL(String(input)).pathname === `/evaluation-profiles/${office.id}`
        ? new Promise<Response>(() => {})
        : ownLibrary(input, init)
    );
    mount(`/evaluari-de-risc/${office.id}`);
    const back = await screen.findByTestId('page-back', {}, { timeout: 3000 });
    expect(back.getAttribute('href')).toBe('/evaluari-de-risc');
    expect(screen.getAllByTestId('page-back')).toHaveLength(1);
    expect(screen.queryByTestId('route-error-page')).toBeNull();
  });

  it('shows the result and the factors with the evaluation page’s own card', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${office.id}`);
    await screen.findByTestId('risk-profile-page');
    expect(screen.getByTestId('risk-global-level').textContent).toBe('3,33');
    expect(screen.getByTestId('risk-result-counts').textContent).toBe(
      'Unul din 2 factori este inacceptabil.'
    );
    expect(
      screen.getAllByTestId('risk-factor-row').map((row) => row.querySelector('p')?.textContent)
    ).toEqual(['Electrocutare prin atingere indirectă', 'Lucru prelungit la monitor']);
    expect(screen.queryByTestId('risk-factors-copy')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Lucrător de birou' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Înapoi la evaluările de risc' }).getAttribute('href')
    ).toBe('/evaluari-de-risc');
  });

  it('says above the factors that their plan fields are defaults', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${office.id}`);
    const card = await screen.findByTestId('risk-factors-card');
    expect(
      within(card).getByText(
        'Termenele și persoanele care răspund de măsuri, din plan, se copiază în fișă ca valori implicite; le schimbi acolo pentru fiecare client.'
      )
    ).toBeTruthy();
  });

  it('shows and edits the work system in the evaluation page’s card, its exposure left empty', async () => {
    const workshop = makeProfile({
      name: 'Strungar',
      meansOfProduction: 'Strung, polizor',
      exposure: '6 h / zi',
    });
    mockProfilesApi({ profiles: [workshop] });
    mount(`/evaluari-de-risc/${workshop.id}`);
    const card = await screen.findByTestId('work-system-card');
    expect(
      within(card).getByText(
        'Când aplici evaluarea, aceste texte completează doar câmpurile goale ale fișei.'
      )
    ).toBeTruthy();
    expect(within(card).getByTestId('work-system-means').textContent).toBe('Strung, polizor');
    expect(within(card).getByTestId('work-system-environment').textContent).toBe('—');
    expect(within(card).getByTestId('work-system-exposure').textContent).toBe('6 h / zi');
    expect(within(card).queryByTestId('work-system-exposed-persons')).toBeNull();

    const user = userEvent.setup();
    await user.click(within(card).getByTestId('work-system-edit'));
    expect(screen.queryByTestId('work-system-workTask')).toBeNull();
    await user.type(screen.getByTestId('work-system-workEnvironment'), 'Hală ventilată');
    await user.clear(screen.getByTestId('work-system-exposure-input'));
    await user.click(screen.getByTestId('work-system-save'));
    await waitFor(() =>
      expect(bodiesOf(`/evaluation-profiles/${workshop.id}`, 'PATCH')).toEqual([
        { meansOfProduction: 'Strung, polizor', workEnvironment: 'Hală ventilată', exposure: null },
      ])
    );
    const saved = await screen.findByTestId('work-system-environment');
    expect(saved.textContent).toBe('Hală ventilată');
    expect(screen.getByTestId('work-system-exposure').textContent).toBe('—');
  });

  it('adds a factor with the evaluation page’s dialog', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${driver.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factor-add'));
    await screen.findByTestId('risk-factor-dialog');
    await user.selectOptions(screen.getByTestId('risk-factor-component'), 'work_environment');
    await user.click(screen.getByTestId('risk-factor-group'));
    await user.click(screen.getByRole('option', { name: 'Factori de risc fizic' }));
    await user.type(screen.getByTestId('risk-factor-description'), 'Vibrații la volan');
    await user.selectOptions(screen.getByTestId('risk-factor-gravity'), '2');
    await user.selectOptions(screen.getByTestId('risk-factor-probability'), '5');
    await user.click(screen.getByTestId('risk-factor-save'));
    await waitFor(() =>
      expect(bodiesOf(`/evaluation-profiles/${driver.id}/factors`, 'POST')).toEqual([
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

  it('deletes a profile no client uses after asking, and goes back to the library', async () => {
    const unused = makeProfile({ name: 'Casier', factors: [electrocution, screenWork] });
    mockProfilesApi({ profiles: [office, unused] });
    const runtime = mount(`/evaluari-de-risc/${unused.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-remove'));
    const dialog = await screen.findByTestId('risk-profile-remove-dialog');
    expect(dialog.textContent).toContain('împreună cu cei 2 factori ai ei');
    expect(dialog.textContent).toContain('Nu o folosește niciun client.');
    await user.click(within(dialog).getByTestId('risk-profile-remove-confirm'));
    await screen.findByTestId('risk-library');
    expect(bodiesOf(`/evaluation-profiles/${unused.id}`, 'DELETE')).toHaveLength(1);
    expect(runtime.router.state.location.pathname).toBe('/evaluari-de-risc');
    expect(
      (await screen.findAllByTestId('risk-profile-open')).map((link) => link.textContent)
    ).toEqual(['Lucrător de birou']);
  });

  it('says why a profile a client started using meanwhile is not deleted', async () => {
    mockProfilesApi();
    const ownLibrary = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname === `/evaluation-profiles/${driver.id}` &&
      init?.method === 'DELETE'
        ? conflict('evaluation_profile_in_use')
        : ownLibrary(input, init)
    );
    mount(`/evaluari-de-risc/${driver.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-remove'));
    const dialog = await screen.findByTestId('risk-profile-remove-dialog');
    await user.click(within(dialog).getByTestId('risk-profile-remove-confirm'));
    expect((await screen.findByTestId('risk-profile-remove-error')).textContent).toContain(
      'Evaluarea este folosită la clienți, așa că nu se poate șterge. O poți arhiva'
    );
  });

  it('shows why a profile is not deleted while the profile is read again, and stays open', async () => {
    let release: () => void = () => undefined;
    const reread = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refused = false;
    let held = 0;
    mockProfilesApi();
    const ownLibrary = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname !== `/evaluation-profiles/${driver.id}`) return ownLibrary(input, init);
      if (init?.method === 'DELETE') {
        refused = true;
        return conflict('evaluation_profile_in_use');
      }
      if (refused) {
        held += 1;
        await reread;
      }
      return ownLibrary(input, init);
    });
    mount(`/evaluari-de-risc/${driver.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-profile-remove'));
    const dialog = await screen.findByTestId('risk-profile-remove-dialog');
    await user.click(within(dialog).getByTestId('risk-profile-remove-confirm'));
    await waitFor(() => expect(held).toBeGreaterThan(0));
    expect(within(dialog).getByTestId('risk-profile-remove-error').textContent).toContain(
      'Evaluarea este folosită la clienți'
    );
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('risk-profile-remove-dialog')).toBe(dialog);
    release();
    await waitFor(() =>
      expect(
        within(dialog).getByTestId<HTMLButtonElement>('risk-profile-remove-confirm').disabled
      ).toBe(false)
    );
  });

  it('offers archiving in place of deleting while clients use the profile', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${office.id}`);
    const user = userEvent.setup();
    expect(screen.queryByTestId('risk-profile-remove')).toBeNull();
    await user.click(await screen.findByTestId('risk-profile-archive'));
    const dialog = await screen.findByTestId('risk-profile-archive-dialog');
    expect(dialog.textContent).toContain('fișele clienților care o folosesc nu se schimbă');
    await user.click(within(dialog).getByTestId('risk-profile-archive-confirm'));
    const notice = await screen.findByTestId('risk-profile-archived');
    expect(notice.textContent).toContain('nu apare în „Aplică din bibliotecă”');
    expect(screen.getByTestId('risk-profile-usage')).toBeTruthy();
    await user.click(screen.getByTestId('risk-profile-restore'));
    await user.click(
      within(await screen.findByTestId('risk-profile-archive-dialog')).getByTestId(
        'risk-profile-archive-confirm'
      )
    );
    await waitFor(() => expect(screen.queryByTestId('risk-profile-archived')).toBeNull());
    expect(bodiesOf(`/evaluation-profiles/${office.id}`, 'PATCH')).toEqual([
      { archived: true },
      { archived: false },
    ]);
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
    mockProfilesApi({
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
    mount(`/evaluari-de-risc/${office.id}`);
    const usage = await screen.findByTestId('risk-profile-usage');
    expect(within(usage).getByRole('heading').textContent).toContain('Unde este folosită');
    const clients = await within(usage).findAllByTestId('risk-profile-usage-client');
    expect(within(usage).getByTestId('risk-profile-usage-count').textContent).toBe('3 fișe');
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
      ['Contabil', '2 factori din această evaluare'],
      ['Vizitatori', 'Un factor din această evaluare'],
    ]);
    expect(within(rows[0]!).getByTestId('risk-profile-usage-open').getAttribute('href')).toBe(
      accountantEvaluationPath
    );
    expect(within(rows[1]!).getByTestId('risk-profile-usage-open').getAttribute('href')).toBe(
      `${positionsPage}/fise-de-evaluare/${visitorsUse.id}`
    );
  });

  it('says how a profile comes to be used while no evaluation uses it', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${driver.id}`);
    const empty = await screen.findByTestId('risk-profile-usage-empty');
    expect(empty.textContent).toContain('nu este folosită încă la niciun client');
    expect(empty.textContent).toContain('„Aplică din bibliotecă”');
  });

  it('says why a profile used only by archived posts cannot be deleted', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${office.id}`);
    const archivedOnly = await screen.findByTestId('risk-profile-usage-archived-only');
    expect(archivedOnly.textContent).toContain('posturi arhivate');
    expect(archivedOnly.textContent).toContain('nu se poate șterge');
    expect(screen.queryByTestId('risk-profile-usage-empty')).toBeNull();
    expect(screen.queryByTestId('risk-profile-remove')).toBeNull();
  });

  it('offers to retry when the evaluations using the profile do not load', async () => {
    let failing = true;
    mockProfilesApi({
      usage: () =>
        failing
          ? Response.json({ error: 'forbidden', message: 'no' }, { status: 403 })
          : Response.json({ items: [] }),
    });
    mount(`/evaluari-de-risc/${driver.id}`);
    const user = userEvent.setup();
    const error = await screen.findByTestId('risk-profile-usage-error');
    failing = false;
    await user.click(within(error).getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('risk-profile-usage-empty')).toBeTruthy();
  });

  it('is not found for a profile the library does not hold', async () => {
    mockProfilesApi();
    mount(`/evaluari-de-risc/${uuid()}`);
    expect(await screen.findByTestId('risk-profile-not-found')).toBeTruthy();
  });
});

describe('an evaluation and the library', () => {
  it('invites saving a hand-typed evaluation into the library, under the position’s name', async () => {
    mockProfilesApi();
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    const nudge = await screen.findByTestId('risk-library-nudge');
    expect(nudge.textContent).toContain(
      'Factorii nu sunt încă în biblioteca organizației tale (meniul Evaluări de risc).'
    );
    expect(
      within(nudge).getByRole('link', { name: 'meniul Evaluări de risc' }).getAttribute('href')
    ).toBe('/evaluari-de-risc');
    expect(screen.queryByTestId('risk-evaluation-save-as-profile')).toBeNull();
    await user.click(within(nudge).getByTestId('risk-library-nudge-save'));
    const dialog = await screen.findByTestId('profile-name-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Salvează în bibliotecă');
    expect(within(dialog).getByTestId<HTMLInputElement>('profile-name').value).toBe('Contabil');
    await user.click(within(dialog).getByTestId('profile-name-submit'));
    await waitFor(() =>
      expect(
        bodiesOf(`${evaluationsPath}/${accountantEvaluation.id}/save-as-profile`, 'POST')
      ).toEqual([{ name: 'Contabil' }])
    );
    expect(await screen.findByText(/Evaluarea „Contabil” a fost salvată/)).toBeTruthy();
    expect((await screen.findByTestId('risk-factors-origin')).textContent).toBe(
      'Factorul este în evaluarea Contabil din bibliotecă.'
    );
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.getByTestId('risk-evaluation-save-as-profile').textContent).toBe(
      'Salvează în bibliotecă…'
    );
  });

  it('keeps the invitation away from an evaluation once dismissed', async () => {
    mockProfilesApi();
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
    mockProfilesApi({
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
      'Un factor este în evaluarea Lucrător de birou; celălalt nu este în bibliotecă.'
    );
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.getByTestId('risk-evaluation-save-as-profile')).toBeTruthy();
  });

  it('does not invite saving under an archived client, which can still save from the header', async () => {
    mockProfilesApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount(accountantEvaluationPath);
    await screen.findByTestId('risk-evaluation-save-as-profile');
    expect(screen.queryByTestId('risk-library-nudge')).toBeNull();
    expect(screen.queryByTestId('risk-factors-origin')).toBeNull();
  });

  it('names the one profile all the factors are in once, above the rows', async () => {
    const link = { id: office.id, name: office.name };
    mockProfilesApi({
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
    expect(summary.textContent).toBe(
      'Ambii factori sunt în evaluarea Lucrător de birou din bibliotecă.'
    );
    expect(within(summary).getByRole('link').getAttribute('href')).toBe(
      `/evaluari-de-risc/${office.id}`
    );
    expect(screen.queryByTestId('risk-factor-origin')).toBeNull();
  });

  it('shows the profile each factor is in, and nothing on a hand-typed one', async () => {
    const linked = makeFactor({
      description: 'Electrocutare',
      gravityClass: 5,
      probabilityClass: 2,
      sourceProfile: { id: office.id, name: office.name },
    });
    mockProfilesApi({
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
    expect(origin.textContent).toBe('În evaluarea Lucrător de birou din bibliotecă');
    expect(within(origin).getByRole('link').getAttribute('href')).toBe(
      `/evaluari-de-risc/${office.id}`
    );
    expect(within(second!).queryByTestId('risk-factor-origin')).toBeNull();
    await user.click(within(first!).getByTestId('risk-factor-actions'));
    await user.click(await screen.findByTestId('risk-factor-edit'));
    const dialog = await screen.findByTestId('risk-factor-dialog');
    expect(within(dialog).getByTestId('risk-factor-dialog-origin').textContent).toBe(
      'Factorul este și în evaluarea „Lucrător de birou” din bibliotecă. Ce schimbi aici nu ajunge în bibliotecă.'
    );
  });

  it('offers no saving for an evaluation without factors', async () => {
    mockProfilesApi({ evaluation: makeEvaluation({ factors: [] }) });
    mount(accountantEvaluationPath);
    await screen.findByTestId('risk-factors-empty');
    expect(screen.queryByTestId('risk-evaluation-save-as-profile')).toBeNull();
    expect(screen.getByTestId('risk-factors-empty').textContent).toContain(
      'aplică o evaluare din bibliotecă'
    );
  });

  it('applies a profile with factors, adds its factors after the others and says how many', async () => {
    mockProfilesApi();
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
        bodiesOf(`${evaluationsPath}/${accountantEvaluation.id}/factors/apply-profile`, 'POST')
      ).toEqual([{ profileId: office.id }])
    );
    expect(
      await screen.findByText('2 factori din „Lucrător de birou” au fost adăugați în fișă.')
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('risk-factors-count').textContent).toBe('3 factori')
    );
    expect(screen.getByText('Lucru prelungit la monitor')).toBeTruthy();
  });

  it('chooses from every profile it can apply, read apart from the library’s pages', async () => {
    mockProfilesApi({
      profiles: [
        office,
        makeProfile({ name: 'Arhivat', factors: [electrocution], archivedAt: stamp }),
      ],
    });
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factors-apply-profile'));
    const dialog = await screen.findByTestId('apply-profile-dialog');
    const options = await within(dialog).findAllByTestId('apply-profile-option');
    expect(
      options.map((option) => within(option).getByRole('radio').getAttribute('value'))
    ).toEqual([office.id]);
    expect(bodiesOf('/evaluation-profiles/choices', 'GET')).toHaveLength(1);
    expect(bodiesOf('/evaluation-profiles', 'GET')).toHaveLength(0);
  });

  it('says how a profile comes to exist when the library has none with factors', async () => {
    mockProfilesApi({ profiles: [driver] });
    mount(accountantEvaluationPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-factors-apply-profile'));
    const none = await screen.findByTestId('apply-profile-none');
    expect(none.textContent).toContain('Salvează în bibliotecă');
    expect(within(none).getByRole('link', { name: 'Evaluări de risc' }).getAttribute('href')).toBe(
      '/evaluari-de-risc'
    );
  });
});

describe('searching and filtering the risk library', () => {
  const crane = makeProfile({
    name: 'Macaragiu',
    factors: [
      makeFactor({ description: 'Cădere de sarcină', gravityClass: 7, probabilityClass: 6 }),
      makeFactor({ description: 'Strivire', gravityClass: 5, probabilityClass: 5 }),
    ],
  });

  it('searches by post within the open tab, keeping the words in the address', async () => {
    mockProfilesApi({ profiles: [office, driver, crane] });
    const runtime = mount('/evaluari-de-risc');
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-profile-row');
    const search = screen.getByTestId('risk-library-search');
    expect(search.getAttribute('placeholder')).toBe('Caută după post');
    await user.type(search, 'macara');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'macara' }));
    await waitFor(() =>
      expect(screen.getByTestId('risk-library-count').textContent).toBe('1 din 3 evaluări')
    );
    expect(listQuery(-1).get('q')).toBe('macara');
    expect(listQuery(-1).get('page')).toBe('1');
  });

  it('filters by the global level and by Nefolosită, without counts beside the options', async () => {
    mockProfilesApi({ profiles: [office, driver, crane] });
    const runtime = mount('/evaluari-de-risc');
    const user = userEvent.setup();
    await screen.findAllByTestId('risk-profile-row');
    await user.click(screen.getByTestId('risk-library-filters'));
    const panel = await screen.findByTestId('risk-library-filters-panel');
    expect(
      within(panel)
        .getAllByRole('checkbox')
        .map((option) => option.closest('label')?.textContent)
    ).toEqual(['Peste limită (3,50)', 'În limită', 'Fără factori', 'Nefolosită']);
    await user.click(within(panel).getByTestId('risk-library-filters-level-over'));
    await user.click(within(panel).getByTestId('risk-library-filters-level-none'));
    await waitFor(() =>
      expect(runtime.router.state.location.searchStr).toBe('?level=over&level=none')
    );
    expect(listQuery(-1).getAll('level')).toEqual(['over', 'none']);
    await waitFor(() =>
      expect(screen.getAllByTestId('risk-profile-open').map((link) => link.textContent)).toEqual([
        'Macaragiu',
        'Șofer',
      ])
    );
    await user.click(within(panel).getByTestId('risk-library-filters-usage-unused'));
    await waitFor(() => expect(listQuery(-1).getAll('usage')).toEqual(['unused']));
    expect(screen.getByTestId('risk-library-count').textContent).toBe('2 din 3 evaluări');
    await user.click(within(panel).getByTestId('risk-library-filters-show'));
    const strip = screen.getByTestId('risk-library-applied-filters');
    expect(within(strip).getByTestId('risk-library-applied-filters-level').textContent).toContain(
      'Peste limită, Fără factori'
    );
    await user.click(within(strip).getByTestId('risk-library-applied-filters-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('says when no entry matches, and clears the filters only, keeping the search', async () => {
    mockProfilesApi({ profiles: [office, driver] });
    const runtime = mount('/evaluari-de-risc?level=over&q=birou');
    const empty = await screen.findByTestId('risk-library-empty-filtered');
    expect(empty.textContent).toContain('Nicio evaluare nu se potrivește');
    expect(empty.textContent).toContain(
      'Nicio evaluare activă nu se potrivește căutării și filtrelor alese.'
    );
    expect(screen.getByTestId('risk-library-count').textContent).toBe('0 din 2 evaluări');
    expect(screen.getByTestId('risk-profile-new')).toBeTruthy();
    const clear = within(empty).getByTestId('risk-library-empty-clear');
    expect(clear.textContent).toBe('Șterge filtrele');
    await userEvent.setup().click(clear);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'birou' }));
    await screen.findAllByTestId('risk-profile-row');
  });

  it('clears a search that finds nothing from the empty state', async () => {
    mockProfilesApi();
    const runtime = mount('/evaluari-de-risc?q=stivuitorist');
    const empty = await screen.findByTestId('risk-library-empty-filtered');
    expect(empty.textContent).toContain(
      'Nicio evaluare activă nu are „stivuitorist” în numele postului.'
    );
    const clear = within(empty).getByTestId('risk-library-empty-clear');
    expect(clear.textContent).toBe('Șterge căutarea');
    await userEvent.setup().click(clear);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('puts Evaluare nouă in the message of an empty library, with no search, filters or count', async () => {
    mockProfilesApi({ profiles: [] });
    mount('/evaluari-de-risc');
    const empty = await screen.findByTestId('risk-library-empty');
    expect(empty.textContent).toContain('Nicio evaluare încă');
    expect(empty.textContent).toContain('Importul documentației unui client adaugă aici');
    expect(empty.textContent).toContain('Salvează în bibliotecă');
    expect(empty.textContent).toContain('Evaluare nouă');
    expect(screen.getAllByTestId('risk-profile-new')).toHaveLength(1);
    expect(within(empty).getByTestId('risk-profile-new')).toBeTruthy();
    expect(screen.queryByTestId('risk-library-search')).toBeNull();
    expect(screen.queryByTestId('risk-library-filters')).toBeNull();
    expect(screen.queryByTestId('risk-library-count')).toBeNull();
    expect(screen.getByTestId('risk-library-filter-archived')).toBeTruthy();
  });
});
