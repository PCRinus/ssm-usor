import {
  type SetupLock,
  type SetupStepId,
  setupStepIds,
  type SubscriptionSummary,
} from '@ssm-usor/contracts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Release, SetupGuide, SetupStep } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { lockReason } from './steps';

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock('@/app/observability/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/observability/posthog')>()),
  captureEvent,
}));

const clientId = '6f0b7e52-3c1d-4a8e-9b2f-1d4c5e6a7b80';
const moduleId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const organization = { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Expert SSM Banat SRL' };

const locks: Partial<Record<SetupStepId, SetupLock>> = {
  'workplaces-positions': 'needs-client',
  employees: 'needs-workplace-and-position',
  'responsible-persons': 'needs-client',
  'risk-evaluation': 'needs-position',
  'fire-safety-data': 'needs-client',
  'generate-sets': 'needs-basic-data',
  'issue-document': 'needs-draft',
  'portal-invitation': 'needs-employee',
  training: 'needs-employee',
  signature: 'needs-training-record',
};

function guideWith(
  changes: Partial<Record<SetupStepId, Partial<SetupStep>>> = {},
  rest: Partial<SetupGuide> = {}
): SetupGuide {
  const steps = setupStepIds.map((id): SetupStep => {
    const base: SetupStep =
      id === 'account' || id === 'company' || id === 'authorizations' || id === 'professional-title'
        ? { id, state: 'done', canDo: true }
        : locks[id]
          ? { id, state: 'locked', canDo: true, lock: locks[id] }
          : { id, state: 'open', canDo: true };
    return { ...base, ...changes[id] };
  });
  const next = steps.find((step) => step.state === 'open' && step.canDo)?.id ?? null;
  return {
    steps,
    next,
    clientId: null,
    ownerName: 'Ioana Popescu',
    organizationHasClients: false,
    closed: false,
    finished: false,
    ...rest,
  };
}

const founder = guideWith();

const everythingDone = guideWith(
  Object.fromEntries(
    setupStepIds.map((id) => [id, { state: 'done' as const, lock: undefined }])
  ) as Partial<Record<SetupStepId, Partial<SetupStep>>>,
  { clientId }
);

const unreadRelease: Release = {
  tag: '2026.10.28',
  publishedAt: '2026-10-28T08:00:00.000Z',
  headline: 'Ghidul de configurare',
  lead: null,
  features: [],
  improvements: ['Lista de clienți se încarcă mai repede.'],
  fixes: [],
  unread: true,
};

const fetchMock = vi.fn<typeof fetch>();

interface ApiState {
  guide: SetupGuide;
  role?: 'owner' | 'specialist';
  membership?: boolean;
  impersonating?: boolean;
  subscription?: SubscriptionSummary | null;
  releases?: Release[];
}

function mockApi(state: ApiState) {
  let guide = state.guide;
  let releases = state.releases ?? [];
  const api = {
    get guide() {
      return guide;
    },
    set guide(next: SetupGuide) {
      guide = next;
    },
  };
  const withStep = (id: string, change: Partial<SetupStep>) => {
    const steps = guide.steps.map((step) => (step.id === id ? { ...step, ...change } : step));
    guide = {
      ...guide,
      steps,
      next: steps.find((step) => step.state === 'open' && step.canDo)?.id ?? null,
    };
  };
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'ioana@expertssm.test' },
        profile: { fullName: 'Ioana Popescu', professionalTitle: 'Inspector SSM' },
        membership:
          state.membership === false ? null : { organization, role: state.role ?? 'owner' },
        impersonation: state.impersonating
          ? {
              targetMemberId: '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10',
              targetOrganizationId: organization.id,
            }
          : null,
        subscription: state.subscription ?? null,
      });
    }
    if (pathname === '/dashboard/summary') return Response.json(quietSummary);
    if (pathname === `/instruction-modules/${moduleId}`) {
      return Response.json({
        module: {
          id: moduleId,
          title: 'Scări metalice',
          group: 'work_equipment',
          domain: 'ssm',
          archivedAt: null,
          version: {
            id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
            number: 1,
            sha256: 'a'.repeat(64),
            sizeBytes: 4321,
            articleCount: 12,
            createdAt: '2026-09-26T10:00:00.000Z',
          },
          appliedCount: 0,
          createdAt: '2026-09-26T09:00:00.000Z',
          updatedAt: '2026-09-26T10:00:00.000Z',
        },
      });
    }
    if (pathname === '/releases') return Response.json({ items: releases });
    if (pathname === '/releases/acknowledge' && method === 'POST') {
      releases = releases.map((release) => ({ ...release, unread: false }));
      return Response.json({ acknowledgedThrough: unreadRelease.tag });
    }
    if (pathname === '/me/setup' && method === 'GET') return Response.json(guide);
    if (pathname === '/me/setup' && method === 'PUT') {
      guide = { ...guide, ...(JSON.parse(String(init?.body)) as Partial<SetupGuide>) };
      return Response.json(guide);
    }
    const skip = /^\/me\/setup\/skips\/(.+)$/.exec(pathname);
    if (skip) {
      withStep(skip[1]!, { state: method === 'PUT' ? 'skipped' : 'open' });
      return Response.json(guide);
    }
    return Response.json({ error: 'not_found', message: 'Not here.' }, { status: 404 });
  });
  return api;
}

const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

const bodiesOf = (path: string, method: string) =>
  calls(path, method).map(([, init]) => JSON.parse(String(init?.body)) as unknown);

const mount = (path = '/dashboard') => mountApp(authFixture(makeSession()).client, path);

const openedKey = 'ssm-usor:setup-guide-opened:user-one';

function onPhone() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

const panel = () => screen.findByTestId('setup-guide');

const step = (id: SetupStepId) => screen.getByTestId(`setup-step-${id}`);

async function expectNoGuide() {
  await waitFor(() => expect(calls('/me').length).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(screen.queryByTestId('setup-guide')).toBeNull();
  expect(screen.queryByTestId('setup-guide-pill')).toBeNull();
}

beforeEach(() => {
  captureEvent.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the setup guide on a first load', () => {
  it('opens expanded, with the group of the next step open and the step as a card', async () => {
    mockApi({ guide: founder });
    mount();

    const guide = await panel();
    expect(guide.dataset.view).toBe('expanded');
    expect(within(guide).getByRole('heading', { name: 'Ghid de configurare' })).toBeTruthy();
    expect(screen.getByLabelText('Ghid de configurare').tagName).toBe('SECTION');
    expect(screen.getByTestId('setup-guide-count').textContent).toBe('4 din 15');
    expect(screen.getByTestId('setup-guide-group-client').dataset.open).toBe('true');
    expect(screen.getByTestId('setup-guide-group-firma').dataset.open).toBe('false');

    const card = step('client');
    expect(card.dataset.state).toBe('next');
    expect(card.textContent).toContain('Adaugă primul client');
    const action = within(card).getByTestId('setup-step-action-0');
    expect(action.textContent).toBe('Adaugă client');
    expect(action.getAttribute('href')).toBe('/clients/new');
    expect(within(card).queryByText('Importă din documente')).toBeNull();
    expect(within(card).getByTestId('setup-step-skip').textContent).toBe('Știu deja');
    expect(step('workplaces-positions').dataset.state).toBe('locked');
  });

  it('opens collapsed on a later load, with the next step as a link', async () => {
    localStorage.setItem(openedKey, '2026-10-27T10:00:00.000Z');
    mockApi({ guide: founder });
    mount();

    const guide = await panel();
    expect(guide.dataset.view).toBe('collapsed');
    const next = screen.getByTestId('setup-guide-next');
    expect(next.textContent).toBe('Adaugă primul client');
    expect(next.getAttribute('href')).toBe('/clients/new');
  });

  it('remembers that it opened, so the next load is collapsed', async () => {
    mockApi({ guide: founder });
    mount();

    expect((await panel()).dataset.view).toBe('expanded');
    await waitFor(() => expect(localStorage.getItem(openedKey)).not.toBeNull());
  });

  it('keeps the size chosen in this session', async () => {
    mockApi({ guide: founder });
    mount();
    await userEvent.setup().click(await screen.findByTestId('setup-guide-collapse'));
    await waitFor(() => expect(screen.getByTestId('setup-guide').dataset.view).toBe('collapsed'));
    cleanup();
    disposeRuntimes();

    mount();
    expect((await panel()).dataset.view).toBe('collapsed');
    await userEvent.setup().click(screen.getByTestId('setup-guide-expand'));
    await waitFor(() => expect(screen.getByTestId('setup-guide').dataset.view).toBe('expanded'));
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_collapsed', {});
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_expanded', {});
  });

  it('opens collapsed on a phone, as a docked bar', async () => {
    onPhone();
    mockApi({ guide: founder });
    mount();

    const guide = await panel();
    expect(guide.dataset.view).toBe('collapsed');
    expect(screen.getByTestId('setup-guide-close').className).toContain('size-11');
  });

  it('collapses on Escape', async () => {
    mockApi({ guide: founder });
    mount();
    await panel();

    fireEvent.keyDown(screen.getByTestId('setup-guide-collapse'), { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('setup-guide').dataset.view).toBe('collapsed'));
  });
});

describe('the steps', () => {
  it('words the member steps without «primul» once the organization has a client', async () => {
    mockApi({
      guide: guideWith(
        Object.fromEntries(
          Object.keys(locks).map((id) => [id, { state: 'open' as const, lock: undefined }])
        ),
        { organizationHasClients: true, clientId }
      ),
    });
    mount();

    await panel();
    expect(screen.getByTestId('setup-guide-group-client').textContent).toContain(
      'Primul tău client'
    );
    expect(screen.getByTestId('setup-guide-group-documentatie').textContent).toContain(
      'Prima ta documentație'
    );
    expect(step('client').textContent).toContain('Adaugă un client');
    expect(step('workplaces-positions').textContent).toBe('Adaugă puncte de lucru și posturi');
  });

  it('uses «primul» while the organization has no client', async () => {
    mockApi({ guide: founder });
    mount();

    await panel();
    expect(screen.getByTestId('setup-guide-group-client').textContent).toContain('Primul client');
    expect(screen.getByTestId('setup-guide-group-client').textContent).not.toContain('tău');
  });

  it('shows a lock reason on focus', async () => {
    mockApi({ guide: founder });
    mount();
    await panel();

    fireEvent.focus(step('workplaces-positions'));
    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'Adaugă întâi primul client ca să deblochezi pasul.'
    );
  });

  it('names the owner a specialist waits for', () => {
    expect(
      lockReason('needs-organization-data', { ownerName: 'Ioana Popescu', isOwner: false })
    ).toBe('Așteaptă datele firmei de la administrator, Ioana Popescu.');
    expect(lockReason('needs-organization-data', { ownerName: null, isOwner: false })).toBe(
      'Așteaptă datele firmei de la un administrator.'
    );
    expect(
      lockReason('needs-organization-data', { ownerName: 'Ioana Popescu', isOwner: true })
    ).toBe('Completează întâi datele firmei și abilitările.');
    expect(lockReason('needs-employee', { ownerName: null, isOwner: false })).toBe(
      'Adaugă întâi angajații clientului.'
    );
  });

  it('shows the lock reasons in the sheet on a phone', async () => {
    onPhone();
    sessionStorage.setItem('ssm-usor:setup-guide-view:user-one', 'collapsed');
    mockApi({
      guide: guideWith(
        { 'generate-sets': { lock: 'needs-organization-data' } },
        { ownerName: 'Ioana Popescu' }
      ),
      role: 'specialist',
    });
    mount();

    await userEvent.setup().click(await screen.findByTestId('setup-guide-expand'));
    await waitFor(() => expect(screen.getByTestId('setup-guide').dataset.view).toBe('expanded'));
    await userEvent
      .setup()
      .click(
        within(screen.getByTestId('setup-guide-group-documentatie')).getByTestId(
          'setup-guide-group-toggle'
        )
      );
    expect(step('generate-sets').textContent).toContain(
      'Așteaptă datele firmei de la administrator, Ioana Popescu.'
    );
  });

  it('shows a specialist the organization steps they cannot do, with no links', async () => {
    mockApi({
      guide: guideWith({
        company: { state: 'open', canDo: false, missing: ['cui'] },
        authorizations: { state: 'done', canDo: false },
      }),
      role: 'specialist',
    });
    mount();
    await panel();
    await userEvent
      .setup()
      .click(
        within(screen.getByTestId('setup-guide-group-firma')).getByTestId(
          'setup-guide-group-toggle'
        )
      );

    expect(step('company').dataset.state).toBe('owner-only');
    expect(step('company').textContent).toContain(
      'Doar administratorul poate completa · Ioana Popescu'
    );
    expect(within(step('company')).queryByRole('link')).toBeNull();
    expect(step('company').tagName).toBe('DIV');
    expect(step('authorizations').textContent).toContain('Făcut de Ioana Popescu');
    expect(step('authorizations').tagName).toBe('DIV');
  });

  it('names no one among several owners', async () => {
    mockApi({
      guide: guideWith(
        {
          company: { state: 'open', canDo: false },
          authorizations: { state: 'done', canDo: false },
        },
        { ownerName: null }
      ),
      role: 'specialist',
    });
    mount();
    await panel();
    await userEvent
      .setup()
      .click(
        within(screen.getByTestId('setup-guide-group-firma')).getByTestId(
          'setup-guide-group-toggle'
        )
      );

    expect(step('company').textContent).toContain('Doar un administrator poate completa');
    expect(step('authorizations').textContent).toContain('Gata');
  });

  it('links each missing company field with its focus, and opens the first', async () => {
    mockApi({
      guide: guideWith({ company: { state: 'open', missing: ['cui', 'address'] } }),
    });
    mount();
    await panel();

    const card = step('company');
    expect(card.dataset.state).toBe('next');
    expect(within(card).getByTestId('setup-step-missing').textContent).toBe(
      'Lipsesc: CUI, adresa sediului'
    );
    expect(within(card).getByTestId('setup-step-field-cui').getAttribute('href')).toBe(
      '/organization/company?focus=cui'
    );
    expect(within(card).getByTestId('setup-step-field-address').getAttribute('href')).toBe(
      '/organization/company?focus=address'
    );
    expect(within(card).getByTestId('setup-step-action-0').getAttribute('href')).toBe(
      '/organization/company?focus=cui'
    );
    expect(within(card).queryByTestId('setup-step-skip')).toBeNull();
  });

  it('points the authorizations and the professional title at their fields', async () => {
    mockApi({
      guide: guideWith({
        authorizations: { state: 'open', missing: ['fire-safety-technician'] },
        'professional-title': { state: 'open' },
      }),
    });
    mount();
    await panel();

    const card = step('authorizations');
    expect(within(card).getByTestId('setup-step-missing').textContent).toBe(
      'Lipsește: cadrul tehnic PSI'
    );
    expect(within(card).getByTestId('setup-step-action-0').getAttribute('href')).toBe(
      '/organization/authorizations?focus=fire-safety-technician'
    );
    expect(step('professional-title').getAttribute('href')).toBe(
      '/profile?focus=professional-title'
    );
  });

  it('opens a workflow step on the furthest client with no highlight', async () => {
    mockApi({
      guide: guideWith(
        {
          client: { state: 'done' },
          'workplaces-positions': { state: 'done', lock: undefined },
          employees: { state: 'open', lock: undefined },
          'responsible-persons': { state: 'open', lock: undefined },
        },
        { clientId, organizationHasClients: true }
      ),
    });
    mount();
    await panel();
    const user = userEvent.setup();

    const card = step('employees');
    const action = within(card).getByTestId('setup-step-action-0');
    expect(action.textContent).toBe('Adaugă angajat');
    expect(action.getAttribute('href')).toBe(`/clients/${clientId}/employees/new`);
    expect(within(card).queryByText('Importă din fișe')).toBeNull();
    expect(step('responsible-persons').getAttribute('href')).toBe(`/clients/${clientId}/training`);
    expect(step('client').getAttribute('href')).toBe('/clients/new');

    await user.click(action);
    expect(captureEvent).toHaveBeenCalledWith('setup_step_clicked', {
      step: 'employees',
      action: 'form',
    });
  });

  it('skips a member step with Știu deja and undoes it', async () => {
    mockApi({ guide: founder });
    mount();
    await panel();
    const user = userEvent.setup();

    await user.click(within(step('client')).getByTestId('setup-step-skip'));
    await waitFor(() => expect(step('client').dataset.state).toBe('skipped'));
    expect(step('client').textContent).toContain('Știi deja');
    expect(calls('/me/setup/skips/client', 'PUT')).toHaveLength(1);
    expect(captureEvent).toHaveBeenCalledWith('setup_step_skipped', { step: 'client' });

    await user.click(within(step('client')).getByTestId('setup-step-unskip'));
    await waitFor(() => expect(step('client').dataset.state).toBe('next'));
    expect(calls('/me/setup/skips/client', 'DELETE')).toHaveLength(1);
    expect(captureEvent).toHaveBeenCalledWith('setup_step_unskipped', { step: 'client' });
  });
});

describe('when the guide shows', () => {
  it('hides on the document editor pages', async () => {
    mockApi({ guide: founder });
    mount(`/instructions/${moduleId}`);
    await waitFor(() => expect(calls('/me/setup')).toHaveLength(1));
    expect(await screen.findByTestId('app-logo')).toBeTruthy();
    await expectNoGuide();
  });

  it('hides while the organization is read-only', async () => {
    mockApi({
      guide: founder,
      subscription: {
        plan: 'profesional',
        planChosen: false,
        status: 'canceled',
        trialEndsAt: null,
        accessUntil: null,
        access: 'read_only',
        deletesAt: '2026-11-28T12:00:00.000Z',
      },
    });
    mount();
    await screen.findByTestId('subscription-badge');
    await expectNoGuide();
  });

  it('hides while the platform admin acts as an owner', async () => {
    mockApi({ guide: founder, impersonating: true });
    mount();
    await waitFor(() => expect(calls('/me/setup')).toHaveLength(1));
    await expectNoGuide();
  });

  it('hides for an account without a membership', async () => {
    mockApi({ guide: founder, membership: false });
    mount();
    await expectNoGuide();
    expect(calls('/me/setup')).toHaveLength(0);
  });

  it('hides once finished', async () => {
    mockApi({ guide: { ...everythingDone, finished: true } });
    mount();
    await waitFor(() => expect(calls('/me/setup')).toHaveLength(1));
    await expectNoGuide();
  });

  it('waits for the update dialog to close', async () => {
    mockApi({ guide: founder, releases: [unreadRelease] });
    mount();

    const dialog = await screen.findByTestId('update-dialog');
    await waitFor(() => expect(calls('/me/setup')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('setup-guide')).toBeNull();
    await userEvent.setup().click(within(dialog).getByTestId('update-dialog-acknowledge'));

    expect((await panel()).dataset.view).toBe('expanded');
  });
});

describe('closing and reopening', () => {
  it('leaves a pill in the header that brings the guide back collapsed', async () => {
    mockApi({ guide: founder });
    mount();
    await panel();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('setup-guide-close'));
    const pill = await screen.findByRole('button', {
      name: 'Ghid de configurare, 4 din 15 pași făcuți',
    });
    expect(pill.dataset.testid).toBe('setup-guide-pill');
    expect(pill.textContent).toBe('Ghid de configurare4/15');
    expect(screen.queryByTestId('setup-guide')).toBeNull();
    expect(bodiesOf('/me/setup', 'PUT')).toEqual([{ closed: true }]);

    await user.click(pill);
    expect((await panel()).dataset.view).toBe('collapsed');
    expect(screen.queryByTestId('setup-guide-pill')).toBeNull();
    expect(bodiesOf('/me/setup', 'PUT')).toEqual([{ closed: true }, { closed: false }]);
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_closed', {});
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_reopened', { from: 'pill' });
  });

  it('stays closed across loads, as the account says', async () => {
    mockApi({ guide: { ...founder, closed: true } });
    mount();

    expect(await screen.findByTestId('setup-guide-pill')).toBeTruthy();
    expect(screen.queryByTestId('setup-guide')).toBeNull();
  });

  it('shows a ring after the subscription badge on a phone, which brings it back collapsed', async () => {
    onPhone();
    mockApi({ guide: { ...founder, closed: true } });
    mount();

    const ring = await screen.findByRole('button', {
      name: 'Ghid de configurare, 4 din 15 pași făcuți',
    });
    expect(ring.dataset.testid).toBe('setup-guide-ring');
    expect(ring.textContent).toBe('');
    expect(screen.queryByTestId('setup-guide-pill')).toBeNull();

    await userEvent.setup().click(ring);
    expect((await panel()).dataset.view).toBe('collapsed');
  });

  it('shows Gata once everything is done, and leaves when collapsed', async () => {
    mockApi({ guide: everythingDone });
    localStorage.setItem(openedKey, '2026-10-27T10:00:00.000Z');
    mount();

    const guide = await panel();
    expect(guide.dataset.view).toBe('expanded');
    expect(screen.getByTestId('setup-guide-finished').textContent).toContain('Gata');
    expect(screen.getByTestId('setup-guide-count').textContent).toBe('15 din 15');
    for (const group of ['firma', 'client', 'documentatie', 'instruire']) {
      expect(screen.getByTestId(`setup-guide-group-${group}`).textContent).toContain('Gata');
    }

    await userEvent.setup().click(screen.getByTestId('setup-guide-collapse'));
    await waitFor(() => expect(screen.queryByTestId('setup-guide')).toBeNull());
    expect(screen.queryByTestId('setup-guide-pill')).toBeNull();
    expect(bodiesOf('/me/setup', 'PUT')).toEqual([{ finished: true }]);
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_finished', {});
  });

  it('finishes when closed on Gata', async () => {
    mockApi({ guide: everythingDone });
    mount();
    await panel();

    await userEvent.setup().click(screen.getByTestId('setup-guide-close'));
    await waitFor(() => expect(screen.queryByTestId('setup-guide')).toBeNull());
    expect(bodiesOf('/me/setup', 'PUT')).toEqual([{ finished: true }]);
  });
});

describe('Setări', () => {
  it('lists the guide with its progress and shows it again collapsed', async () => {
    mockApi({ guide: { ...everythingDone, finished: true } });
    mount('/setari');
    const user = userEvent.setup();

    const entry = await screen.findByTestId('settings-setup-guide');
    expect(entry.textContent).toContain('Ghid de configurare');
    expect(screen.getByTestId('settings-setup-guide-progress').textContent).toBe('15 din 15');
    expect(screen.queryByTestId('setup-guide')).toBeNull();

    await user.click(screen.getByTestId('settings-setup-guide-show'));
    expect((await panel()).dataset.view).toBe('collapsed');
    expect(screen.getByTestId('setup-guide-finished')).toBeTruthy();
    expect(bodiesOf('/me/setup', 'PUT')).toEqual([{ closed: false, finished: false }]);
    expect(captureEvent).toHaveBeenCalledWith('setup_guide_reopened', { from: 'settings' });
  });

  it('shows a closed guide collapsed', async () => {
    mockApi({ guide: { ...founder, closed: true } });
    mount('/setari');

    await userEvent.setup().click(await screen.findByTestId('settings-setup-guide-show'));
    expect((await panel()).dataset.view).toBe('collapsed');
    expect(screen.getByTestId('setup-guide-next').textContent).toBe('Adaugă primul client');
  });
});

describe('refetching', () => {
  it('ticks a step after another change, and tells PostHog', async () => {
    const api = mockApi({ guide: founder });
    const runtime = mount();
    await panel();
    expect(calls('/me/setup')).toHaveLength(1);

    api.guide = guideWith(
      { client: { state: 'done' }, 'workplaces-positions': { state: 'open', lock: undefined } },
      { clientId, organizationHasClients: true }
    );
    await runtime.queryClient
      .getMutationCache()
      .build(runtime.queryClient, { mutationFn: () => Promise.resolve('client') })
      .execute(undefined);

    await waitFor(() => expect(step('client').dataset.state).toBe('done'));
    expect(step('workplaces-positions').dataset.state).toBe('next');
    expect(captureEvent).toHaveBeenCalledWith('setup_step_done', { step: 'client' });
    expect(captureEvent).toHaveBeenCalledTimes(1);
  });

  it('does not refetch after its own changes', async () => {
    mockApi({ guide: founder });
    mount();
    await panel();

    await userEvent.setup().click(within(step('client')).getByTestId('setup-step-skip'));
    await waitFor(() => expect(step('client').dataset.state).toBe('skipped'));
    expect(calls('/me/setup')).toHaveLength(1);
  });
});
