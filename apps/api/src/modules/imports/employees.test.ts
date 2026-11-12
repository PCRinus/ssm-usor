import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import type { ClientTrainingFacts } from '../trainings/client-facts';
import { hiringPlans } from '../trainings/proposal';
import { importSpecialist, peopleCounts, personStates, themesFromFacts } from './employees';

const positionId = 'b0000000-0000-4000-8000-000000000001';

const facts: ClientTrainingFacts = {
  positions: new Map([[positionId, { name: 'Vânzător', staffCategory: 'execution' }]]),
  themes: {
    ssm: {
      id: 'd0000000-0000-4000-8000-000000000001',
      snapshot: {
        themes: {
          positions: [
            {
              name: 'VÂNZĂTOR',
              sessions: [
                { month: 'MAI', content: 'Riscurile la casa de marcat', duration: '90 min' },
              ],
            },
          ],
        },
      },
    },
    su: null,
  },
  people: {
    specialist: { name: 'Ana Popescu', jobTitle: 'Inspector SSM', employeeId: null },
    workplaceManager: { name: 'Elena Marin', jobTitle: 'Șef magazin', employeeId: null },
    legalRepresentative: { name: 'Vasile Georgescu', jobTitle: 'Administrator', employeeId: null },
    fireSafetyTechnician: { name: 'Ion Stan', jobTitle: 'Cadru tehnic PSI', employeeId: null },
  },
  periodicMinutes: { ssm: 60, su: 120 },
};

describe('themesFromFacts', () => {
  const themes = themesFromFacts(facts, '2026-10-31');

  it("proposes the post's session of the row's month, by the trainer the themes name", () => {
    expect(
      themes({ domain: 'ssm', phase: 'periodic', heldOn: '2025-05-12', jobPositionId: positionId })
    ).toEqual({
      trainerName: 'Elena Marin',
      trainerJobTitle: 'Șef magazin',
      material: 'Riscurile la casa de marcat',
      durationMinutes: 90,
    });
  });

  it('proposes no periodic material for a row with no date, whose month is unknown', () => {
    expect(
      themes({ domain: 'ssm', phase: 'periodic', heldOn: null, jobPositionId: positionId })
    ).toMatchObject({ trainerName: 'Elena Marin', material: null, durationMinutes: 90 });
  });

  it('proposes the hiring plans and the external trainers, as for a training typed by hand', () => {
    expect(
      themes({ domain: 'su', phase: 'introductory_general', heldOn: null, jobPositionId: null })
    ).toEqual({
      trainerName: 'Ion Stan',
      trainerJobTitle: 'Cadru tehnic PSI',
      material: hiringPlans.su.introductoryGeneral,
      durationMinutes: 480,
    });
    expect(
      themes({ domain: 'su', phase: 'periodic', heldOn: '2025-05-12', jobPositionId: null })
    ).toMatchObject({ material: null, durationMinutes: 120 });
  });
});

describe('personStates', () => {
  it('reads every person as still to check unless the member checked or set them aside', () => {
    const states = personStates(
      { people: [{ id: 'person-1' }, { id: 'person-2' }, { id: 'person-3' }] },
      {
        people: {
          'person-1': { state: 'checked' },
          'person-3': { state: 'set_aside' },
          'person-9': { state: 'checked' },
        },
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      }
    );

    expect(states).toEqual({
      'person-1': 'checked',
      'person-2': 'to_check',
      'person-3': 'set_aside',
    });
    expect(peopleCounts(states)).toEqual({ total: 3, toCheck: 1, checked: 1, setAside: 1 });
  });
});

describe('importSpecialist', () => {
  const adminId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
  const memberId = '9ae7d65f-fac5-4b57-9d9b-3e502febfd31';
  const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
  const createdAt = '2026-11-11T10:15:00.123456+00:00';
  const row = { organization_id: organizationId, created_by: adminId, created_at: createdAt };
  const admin = () =>
    adminClient({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
    });
  const answer = (impersonation: unknown, member: unknown = null) => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      Response.json(
        new URL(String(input)).pathname === '/rest/v1/impersonations' ? impersonation : member
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const searchOf = (fetchMock: ReturnType<typeof answer>, path: string) =>
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === path)!.searchParams;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the member an admin impersonated when he started the import', async () => {
    const fetchMock = answer({ target_user_id: memberId }, { user_id: memberId });

    expect(await importSpecialist(admin(), row)).toBe(memberId);
    const search = searchOf(fetchMock, '/rest/v1/impersonations');
    expect(search.get('admin_user_id')).toBe(`eq.${adminId}`);
    expect(search.get('started_at')).toBe('lte.2026-11-11T10:15:00.123Z');
    expect(search.get('expires_at')).toBe('gt.2026-11-11T10:15:00.123Z');
    expect(search.get('or')).toBe('(ended_at.is.null,ended_at.gt.2026-11-11T10:15:00.123Z)');
    const member = searchOf(fetchMock, '/rest/v1/organization_members');
    expect(member.get('user_id')).toBe(`eq.${memberId}`);
    expect(member.get('organization_id')).toBe(`eq.${organizationId}`);
  });

  it('never names a member of another organization than the import’s', async () => {
    answer({ target_user_id: memberId }, null);

    expect(await importSpecialist(admin(), row)).toBe(adminId);
  });

  it('names whoever started it otherwise, and nobody for an import without its creator', async () => {
    answer(null);

    expect(await importSpecialist(admin(), row)).toBe(adminId);
    expect(await importSpecialist(admin(), { ...row, created_by: null })).toBeNull();
  });

  it('names whoever started it, without a lookup, for a record without its creation time', async () => {
    const fetchMock = answer({ target_user_id: memberId }, { user_id: memberId });

    expect(await importSpecialist(admin(), { ...row, created_at: null })).toBe(adminId);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
