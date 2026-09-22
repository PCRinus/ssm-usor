import { describe, expect, it } from 'vitest';

import { fakeClients } from './seed-clients';
import { responsiblePersonsFor, workplaceFor } from './seed-document-data';
import { seedOrganizationId } from './seed-organization';

const userId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';

const client = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  county_code: 'TM',
  locality: 'Timișoara',
  address_line: 'Str. Goethe 2',
  legal_representative_name: 'Maria Popescu',
  legal_representative_role: 'Director general',
};

const employee = {
  id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  first_name: 'Paolo-Antonio',
  last_name: 'Luca',
  job_title: 'Manager magazin',
};

describe('fakeClients document details', () => {
  const rows = fakeClients(40, 7, seedOrganizationId, userId);

  it('gives complete clients a role and a valid training schedule, and leaves the rest empty', () => {
    const complete = rows.filter((row) => row.legal_representative_name);
    const incomplete = rows.filter((row) => !row.legal_representative_name);
    expect(complete.length).toBeGreaterThan(0);
    expect(incomplete.length).toBeGreaterThan(0);
    for (const row of complete) {
      expect(row.legal_representative_role).toMatch(/^(Administrator|Director general)$/);
      expect([30, 60, 90, 120]).toContain(row.periodic_training_minutes);
      expect([3, 6]).toContain(row.administrative_training_interval_months);
      expect(row.worker_training_interval_months).toBe(3);
      expect(row.training_day_from!).toBeLessThanOrEqual(row.training_day_to!);
      expect(row.training_day_to!).toBeLessThanOrEqual(31);
    }
    // These are what the generation form's "missing data" list needs to be tried on.
    for (const row of incomplete) expect(row.training_first_month).toBeUndefined();
  });

  it('keeps the CUIs of the sequence, so a rerun updates clients instead of adding them', () => {
    // The first CUIs for seed 7 as they were before the document details existed. If this
    // fails, something new draws from faker and every later client of the sequence moved.
    expect(rows.slice(0, 3).map((row) => row.cui)).toEqual(['39077832', '239223173', '317555550']);
  });
});

describe('workplaceFor', () => {
  it('makes a registered office from the client address', () => {
    expect(workplaceFor(client, userId)).toEqual({
      organization_id: seedOrganizationId,
      client_id: client.id,
      name: 'Sediu social',
      is_registered_office: true,
      county_code: 'TM',
      locality: 'Timișoara',
      address_line: 'Str. Goethe 2',
      created_by: userId,
    });
  });

  it('skips a client without an address', () => {
    expect(workplaceFor({ ...client, locality: null }, userId)).toBeNull();
  });
});

describe('responsiblePersonsFor', () => {
  it('covers the four roles between an employee and the legal representative', () => {
    const rows = responsiblePersonsFor(client, [employee], userId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      employee_id: employee.id,
      full_name: 'Paolo-Antonio Luca',
      job_title: 'Manager magazin',
      roles: ['workplace_manager', 'first_aid'],
    });
    expect(rows[1]).toMatchObject({
      full_name: 'Maria Popescu',
      job_title: 'Director general',
      roles: ['risk_evaluation_team', 'imminent_danger'],
    });
    expect(rows[1]).not.toHaveProperty('employee_id');
  });

  it('seeds nobody for a client without employees and without a representative', () => {
    expect(
      responsiblePersonsFor({ ...client, legal_representative_name: null }, [], userId)
    ).toEqual([]);
  });

  it("adds workers' representatives from 10 employees, two from 50", () => {
    const staff = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...employee, id: `employee-${index}` }));
    const representatives = (count: number) =>
      responsiblePersonsFor(client, staff(count), userId)
        .filter((row) => row.roles?.includes('workers_representative'))
        .map((row) => row.employee_id);
    expect(representatives(9)).toEqual([]);
    expect(representatives(10)).toEqual(['employee-1']);
    expect(representatives(50)).toEqual(['employee-1', 'employee-2']);
  });
});
