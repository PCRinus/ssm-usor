import { type SetupGuide, setupGuideSchema, setupStepIds } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const admin = { id: '9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', email: 'admin@ssmusor.ro' };
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = '7d2e4f60-8a1b-4c3d-9e5f-1a2b3c4d5e6f';

type ProgressRow = Record<string, unknown>;

const emptyProgress: ProgressRow = {
  organization_id: organizationId,
  legal_name_filled: false,
  cui_filled: false,
  address_filled: false,
  representative_name_filled: false,
  representative_role_filled: false,
  certificate_filled: false,
  fire_safety_technician_filled: false,
  company_done: false,
  authorizations_done: false,
  professional_title_done: false,
  client_done: false,
  workplaces_positions_done: false,
  employees_done: false,
  responsible_persons_done: false,
  risk_evaluation_done: false,
  fire_safety_data_done: false,
  generate_sets_done: false,
  issue_document_done: false,
  portal_invitation_done: false,
  training_done: false,
  signature_done: false,
  has_client: false,
  has_client_with_workplace_and_position: false,
  has_client_with_position: false,
  has_client_with_basic_data: false,
  has_draft_revision: false,
  has_client_with_employee: false,
  has_training_record: false,
  furthest_client_id: null,
  owner_count: 1,
  owner_names: ['Ioana Popescu'],
};

const organizationReady: ProgressRow = {
  legal_name_filled: true,
  cui_filled: true,
  address_filled: true,
  representative_name_filled: true,
  representative_role_filled: true,
  certificate_filled: true,
  fire_safety_technician_filled: true,
  company_done: true,
  authorizations_done: true,
};

const everythingUnlocked: ProgressRow = {
  ...organizationReady,
  has_client: true,
  has_client_with_workplace_and_position: true,
  has_client_with_position: true,
  has_client_with_basic_data: true,
  has_draft_revision: true,
  has_client_with_employee: true,
  has_training_record: true,
  furthest_client_id: clientId,
};

interface Fake {
  caller: { id: string; email: string };
  membership: { user_id: string; role: 'owner' | 'specialist'; access: 'full' | 'read_only' };
  progress: ProgressRow | null;
  profile: { setup_guide_closed_at: string | null; setup_guide_finished_at: string | null } | null;
  skips: Set<string>;
  writes: { method: string; path: string; search: string; body: unknown }[];
}

const colleagueProfile = {
  setup_guide_closed_at: '2026-10-27T09:00:00+00:00',
  setup_guide_finished_at: '2026-10-27T09:05:00+00:00',
};

const fetchMock = vi.fn<typeof fetch>();

function createFake({
  progress = {},
  role = 'owner',
  access = 'full',
  skips = [],
  impersonating = false,
  profile = { setup_guide_closed_at: null, setup_guide_finished_at: null },
}: {
  progress?: ProgressRow | null;
  role?: 'owner' | 'specialist';
  access?: 'full' | 'read_only';
  skips?: string[];
  impersonating?: boolean;
  profile?: Fake['profile'];
} = {}): Fake {
  const fake: Fake = {
    caller: impersonating ? admin : user,
    membership: { user_id: user.id, role, access },
    progress: progress === null ? null : { ...emptyProgress, ...progress },
    profile,
    skips: new Set(skips),
    writes: [],
  };

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (method !== 'GET' && !url.pathname.startsWith('/rest/v1/rpc/')) {
      fake.writes.push({ method, path: url.pathname, search: url.search, body });
    }
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json({ ...fake.caller, is_anonymous: false });
      case '/rest/v1/rpc/current_membership':
        return Response.json([{ ...fake.membership, organization_id: organizationId }]);
      case '/rest/v1/rpc/setup_progress':
        return Response.json(fake.progress ? [fake.progress] : []);
      case '/rest/v1/profiles':
        if (method === 'PATCH') {
          if (!fake.profile) return Response.json([]);
          fake.profile = { ...fake.profile, ...body };
          return Response.json([{ user_id: fake.caller.id }]);
        }
        if (url.searchParams.get('user_id') !== `eq.${fake.caller.id}`) {
          return Response.json(
            fake.profile ? [colleagueProfile, fake.profile] : [colleagueProfile]
          );
        }
        return Response.json(fake.profile ? [fake.profile] : []);
      case '/rest/v1/setup_step_skips': {
        if (method === 'POST') {
          if (fake.skips.has(body.step)) {
            return Response.json(
              { code: '23505', message: 'duplicate key value violates unique constraint' },
              { status: 409 }
            );
          }
          fake.skips.add(body.step);
          return new Response(null, { status: 201 });
        }
        if (method === 'DELETE') {
          fake.skips.delete(url.searchParams.get('step')!.replace(/^eq\./, ''));
          return new Response(null, { status: 204 });
        }
        return Response.json([...fake.skips].map((step) => ({ step })));
      }
      default:
        throw new Error(`Unexpected upstream request: ${method} ${url}`);
    }
  });

  return fake;
}

const request = (method: string, path: string, body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env
  );

async function guideOf(response: Response): Promise<SetupGuide> {
  expect(response.status).toBe(200);
  return setupGuideSchema.parse(await response.json());
}

const getGuide = async () => guideOf(await request('GET', '/me/setup'));

const stepOf = (guide: SetupGuide, id: string) => guide.steps.find((step) => step.id === id)!;

const statesOf = (guide: SetupGuide) =>
  Object.fromEntries(guide.steps.map((step) => [step.id, step.state]));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /me/setup', () => {
  it('answers a new organization with every step in order, only the account done', async () => {
    createFake();

    const guide = await getGuide();

    expect(guide.steps.map((step) => step.id)).toEqual([...setupStepIds]);
    expect(statesOf(guide)).toEqual({
      account: 'done',
      company: 'open',
      authorizations: 'open',
      'professional-title': 'open',
      client: 'open',
      'workplaces-positions': 'locked',
      employees: 'locked',
      'responsible-persons': 'locked',
      'risk-evaluation': 'locked',
      'fire-safety-data': 'locked',
      'generate-sets': 'locked',
      'issue-document': 'locked',
      'portal-invitation': 'locked',
      training: 'locked',
      signature: 'locked',
    });
    expect(guide).toMatchObject({
      next: 'company',
      clientId: null,
      ownerName: 'Ioana Popescu',
      organizationHasClients: false,
      closed: false,
      finished: false,
    });
  });

  it('gives a lock code only to a locked step, and each step its own', async () => {
    createFake();

    const guide = await getGuide();

    expect(Object.fromEntries(guide.steps.map((step) => [step.id, step.lock]))).toEqual({
      account: undefined,
      company: undefined,
      authorizations: undefined,
      'professional-title': undefined,
      client: undefined,
      'workplaces-positions': 'needs-client',
      employees: 'needs-workplace-and-position',
      'responsible-persons': 'needs-client',
      'risk-evaluation': 'needs-position',
      'fire-safety-data': 'needs-client',
      'generate-sets': 'needs-organization-data',
      'issue-document': 'needs-draft',
      'portal-invitation': 'needs-employee',
      training: 'needs-employee',
      signature: 'needs-training-record',
    });
  });

  it.each([
    ['workplaces-positions', 'has_client'],
    ['responsible-persons', 'has_client'],
    ['fire-safety-data', 'has_client'],
    ['employees', 'has_client_with_workplace_and_position'],
    ['risk-evaluation', 'has_client_with_position'],
    ['generate-sets', 'has_client_with_basic_data'],
    ['issue-document', 'has_draft_revision'],
    ['portal-invitation', 'has_client_with_employee'],
    ['training', 'has_client_with_employee'],
    ['signature', 'has_training_record'],
  ])('unlocks %s on the organization fact %s', async (step, fact) => {
    createFake({ progress: { ...organizationReady, professional_title_done: true, [fact]: true } });

    const guide = await getGuide();

    expect(stepOf(guide, step)).toEqual({ id: step, state: 'open', canDo: true });
  });

  it('locks generating the sets on the organization data, then the title, then the basic data', async () => {
    createFake({ progress: { has_client_with_basic_data: false } });
    expect(stepOf(await getGuide(), 'generate-sets').lock).toBe('needs-organization-data');

    createFake({ progress: { ...organizationReady, has_client_with_basic_data: false } });
    expect(stepOf(await getGuide(), 'generate-sets').lock).toBe('needs-professional-title');

    createFake({
      progress: {
        ...organizationReady,
        professional_title_done: true,
        has_client_with_basic_data: false,
      },
    });
    expect(stepOf(await getGuide(), 'generate-sets').lock).toBe('needs-basic-data');
  });

  it.each([
    'legal_name_filled',
    'representative_name_filled',
    'representative_role_filled',
    'fire_safety_technician_filled',
  ])('waits for the organization data while %s is false', async (column) => {
    createFake({
      progress: {
        ...organizationReady,
        professional_title_done: true,
        has_client_with_basic_data: true,
        [column]: false,
      },
    });

    expect(stepOf(await getGuide(), 'generate-sets').lock).toBe('needs-organization-data');
  });

  it('generates the sets without the CUI, the address or the certificate', async () => {
    createFake({
      progress: {
        legal_name_filled: true,
        representative_name_filled: true,
        representative_role_filled: true,
        fire_safety_technician_filled: true,
        professional_title_done: true,
        has_client_with_basic_data: true,
      },
    });

    const guide = await getGuide();

    expect(stepOf(guide, 'company').state).toBe('open');
    expect(stepOf(guide, 'authorizations').state).toBe('open');
    expect(stepOf(guide, 'generate-sets')).toEqual({
      id: 'generate-sets',
      state: 'open',
      canDo: true,
    });
  });

  it('ranks done over skipped, skipped over locked, and locked over open', async () => {
    createFake({
      progress: { employees_done: true, has_client: true },
      skips: ['employees', 'training', 'responsible-persons'],
    });

    const guide = await getGuide();

    expect(stepOf(guide, 'employees')).toEqual({ id: 'employees', state: 'done', canDo: true });
    expect(stepOf(guide, 'training')).toEqual({ id: 'training', state: 'skipped', canDo: true });
    expect(stepOf(guide, 'responsible-persons').state).toBe('skipped');
    expect(stepOf(guide, 'portal-invitation')).toMatchObject({
      state: 'locked',
      lock: 'needs-employee',
    });
    expect(stepOf(guide, 'workplaces-positions').state).toBe('open');
  });

  it('lists the empty fields of the organization steps in the forms’ order', async () => {
    createFake({
      progress: {
        legal_name_filled: true,
        representative_role_filled: true,
        certificate_filled: true,
      },
    });

    const guide = await getGuide();

    expect(stepOf(guide, 'company').missing).toEqual(['cui', 'address', 'representative-name']);
    expect(stepOf(guide, 'authorizations').missing).toEqual(['fire-safety-technician']);
  });

  it('lists every field while the organization steps are untouched, and none once done', async () => {
    createFake();
    const before = await getGuide();
    expect(stepOf(before, 'company').missing).toEqual([
      'cui',
      'legal-name',
      'address',
      'representative-name',
      'representative-role',
    ]);
    expect(stepOf(before, 'authorizations').missing).toEqual([
      'certificate',
      'fire-safety-technician',
    ]);
    expect(stepOf(before, 'client').missing).toBeUndefined();

    createFake({ progress: organizationReady });
    const after = await getGuide();
    expect(stepOf(after, 'company')).toEqual({ id: 'company', state: 'done', canDo: true });
    expect(stepOf(after, 'authorizations')).toEqual({
      id: 'authorizations',
      state: 'done',
      canDo: true,
    });
  });

  it('lets an owner do every step', async () => {
    createFake({ role: 'owner' });

    const guide = await getGuide();

    expect(guide.steps.every((step) => step.canDo)).toBe(true);
  });

  it('leaves the organization steps to the owner for a specialist, who starts elsewhere', async () => {
    createFake({ role: 'specialist' });

    const guide = await getGuide();

    expect(guide.steps.filter((step) => !step.canDo).map((step) => step.id)).toEqual([
      'company',
      'authorizations',
    ]);
    expect(stepOf(guide, 'company')).toMatchObject({ state: 'open', canDo: false });
    expect(guide.next).toBe('professional-title');
  });

  it('picks as next the first open step, past done, skipped and locked ones', async () => {
    createFake({
      progress: {
        ...organizationReady,
        professional_title_done: true,
        client_done: true,
        has_client: true,
        has_client_with_position: true,
      },
      skips: ['workplaces-positions'],
    });

    const guide = await getGuide();

    expect(stepOf(guide, 'employees').state).toBe('locked');
    expect(guide.next).toBe('responsible-persons');
  });

  it('answers no next step when everything is done or skipped', async () => {
    const allDone = Object.fromEntries(
      Object.keys(emptyProgress)
        .filter((column) => column.endsWith('_done'))
        .map((column) => [column, true])
    );
    createFake({ progress: { ...everythingUnlocked, ...allDone, signature_done: false } });
    expect((await getGuide()).next).toBe('signature');

    createFake({
      progress: { ...everythingUnlocked, ...allDone, signature_done: false },
      skips: ['signature'],
    });
    const guide = await getGuide();
    expect(guide.next).toBeNull();
    expect(guide.steps.every((step) => step.state === 'done' || step.state === 'skipped')).toBe(
      true
    );
  });

  it('answers no next step for a specialist whose only open steps are the owner’s', async () => {
    createFake({
      role: 'specialist',
      progress: { professional_title_done: true },
      skips: ['client'],
    });

    expect((await getGuide()).next).toBeNull();
  });

  it('carries the furthest client and whether the organization has clients', async () => {
    createFake({ progress: everythingUnlocked });

    const guide = await getGuide();

    expect(guide.clientId).toBe(clientId);
    expect(guide.organizationHasClients).toBe(true);
  });

  it.each([
    [0, [], null],
    [1, ['Ioana Popescu'], 'Ioana Popescu'],
    [1, [], null],
    [2, ['Ioana Popescu', 'Mihai Ionescu'], null],
    [2, ['Ioana Popescu'], null],
  ])('names %i owner(s) with profiles %j as %j', async (count, owners, ownerName) => {
    createFake({ progress: { owner_count: count, owner_names: owners } });

    expect((await getGuide()).ownerName).toBe(ownerName);
  });

  it('says whether the caller closed or finished the guide', async () => {
    createFake({
      profile: {
        setup_guide_closed_at: '2026-10-28T09:00:00+00:00',
        setup_guide_finished_at: null,
      },
    });

    expect(await getGuide()).toMatchObject({ closed: true, finished: false });
  });

  it('reads the caller’s own profile, not a colleague’s', async () => {
    createFake();

    expect(await getGuide()).toMatchObject({ closed: false, finished: false });
  });

  it('answers an account without a profile as neither closed nor finished', async () => {
    createFake({ profile: null });

    expect(await getGuide()).toMatchObject({ closed: false, finished: false });
  });

  it('refuses an account that is not a member of an organization', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
      if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([]);
      throw new Error(`Unexpected upstream request: ${url}`);
    });

    const response = await request('GET', '/me/setup');

    expect(response.status).toBe(403);
  });

  it('reads while the organization is read-only', async () => {
    createFake({ access: 'read_only' });

    expect((await getGuide()).next).toBe('company');
  });
});

describe('PUT /me/setup', () => {
  it.each([
    ['closed', 'setup_guide_closed_at'],
    ['finished', 'setup_guide_finished_at'],
  ] as const)('sets and clears %s on the caller’s profile', async (key, column) => {
    const fake = createFake();

    const set = await guideOf(await request('PUT', '/me/setup', { [key]: true }));
    expect(set[key]).toBe(true);
    expect(fake.writes).toEqual([
      {
        method: 'PATCH',
        path: '/rest/v1/profiles',
        search: expect.stringContaining(`user_id=eq.${user.id}`),
        body: { [column]: expect.any(String) },
      },
    ]);
    expect(Date.parse(fake.writes[0]!.body![column as never])).toBeGreaterThan(Date.now() - 60_000);

    const cleared = await guideOf(await request('PUT', '/me/setup', { [key]: false }));
    expect(cleared[key]).toBe(false);
    expect(fake.writes[1]!.body).toEqual({ [column]: null });
  });

  it('leaves a moment the request does not name', async () => {
    const fake = createFake({
      profile: { setup_guide_closed_at: null, setup_guide_finished_at: '2026-10-28T09:00:00Z' },
    });

    const guide = await guideOf(await request('PUT', '/me/setup', { closed: true }));

    expect(guide).toMatchObject({ closed: true, finished: true });
    expect(Object.keys(fake.writes[0]!.body as object)).toEqual(['setup_guide_closed_at']);
  });

  it('writes nothing for an empty request and answers the guide', async () => {
    const fake = createFake();

    const guide = await guideOf(await request('PUT', '/me/setup', {}));

    expect(guide.next).toBe('company');
    expect(fake.writes).toEqual([]);
  });

  it('refuses a value that is not a boolean', async () => {
    const fake = createFake();

    const response = await request('PUT', '/me/setup', { closed: 'yes' });

    expect(response.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });

  it('answers 409 for an account without a profile', async () => {
    createFake({ profile: null });

    const response = await request('PUT', '/me/setup', { closed: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'profile_missing' });
  });
});

describe('PUT and DELETE /me/setup/skips/{step}', () => {
  it('skips a member step and undoes the skip', async () => {
    const fake = createFake({ progress: { has_client: true } });

    const skipped = await guideOf(await request('PUT', '/me/setup/skips/responsible-persons'));
    expect(stepOf(skipped, 'responsible-persons').state).toBe('skipped');
    expect(fake.writes[0]).toEqual({
      method: 'POST',
      path: '/rest/v1/setup_step_skips',
      search: '',
      body: { user_id: user.id, step: 'responsible-persons' },
    });

    const undone = await guideOf(await request('DELETE', '/me/setup/skips/responsible-persons'));
    expect(stepOf(undone, 'responsible-persons').state).toBe('open');
    expect(fake.writes[1]).toMatchObject({ method: 'DELETE', path: '/rest/v1/setup_step_skips' });
    expect(fake.writes[1]!.search).toContain(`user_id=eq.${user.id}`);
    expect(fake.writes[1]!.search).toContain('step=eq.responsible-persons');
  });

  it('skips a step already skipped without an error', async () => {
    createFake({ skips: ['client'] });

    const guide = await guideOf(await request('PUT', '/me/setup/skips/client'));

    expect(stepOf(guide, 'client').state).toBe('skipped');
  });

  it('undoes a skip that does not exist without an error', async () => {
    createFake();

    const guide = await guideOf(await request('DELETE', '/me/setup/skips/client'));

    expect(stepOf(guide, 'client').state).toBe('open');
  });

  it.each(['account', 'company', 'authorizations', 'professional-title', 'invite-colleague'])(
    'refuses to skip %s, which is not a member step',
    async (step) => {
      const fake = createFake();

      const skip = await request('PUT', `/me/setup/skips/${step}`);
      const undo = await request('DELETE', `/me/setup/skips/${step}`);

      expect(skip.status).toBe(400);
      expect(undo.status).toBe(400);
      expect(fake.writes).toEqual([]);
    }
  );
});

describe('personal writes', () => {
  it.each([
    ['PUT', '/me/setup', { closed: true }],
    ['PUT', '/me/setup/skips/training', undefined],
    ['DELETE', '/me/setup/skips/training', undefined],
  ])('allows %s %s while the organization is read-only', async (method, path, body) => {
    const fake = createFake({ access: 'read_only' });

    const response = await request(method, path, body);

    expect(response.status).toBe(200);
    expect(fake.writes).toHaveLength(1);
  });

  it('records an impersonating admin’s writes on the admin’s own account', async () => {
    const fake = createFake({ impersonating: true });

    expect((await request('PUT', '/me/setup', { closed: true })).status).toBe(200);
    expect((await request('PUT', '/me/setup/skips/client')).status).toBe(200);
    expect((await request('DELETE', '/me/setup/skips/client')).status).toBe(200);

    expect(fake.writes.map((write) => write.search)).toEqual([
      expect.stringContaining(`user_id=eq.${admin.id}`),
      '',
      expect.stringContaining(`user_id=eq.${admin.id}`),
    ]);
    expect(fake.writes[1]!.body).toEqual({ user_id: admin.id, step: 'client' });
  });
});
