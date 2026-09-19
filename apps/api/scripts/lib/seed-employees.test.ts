import { createEmployeeRequestSchema, isValidCnp } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { fakeEmployees, seedEmployees } from './seed-employees';

const organizationId = '11111111-2222-4333-8444-555555555555';
const userId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const clients = [
  { id: 'c1c1c1c1-0000-4000-8000-000000000001', declared_employee_count: 4 },
  { id: 'c1c1c1c1-0000-4000-8000-000000000002', declared_employee_count: 400 },
  { id: 'c1c1c1c1-0000-4000-8000-000000000003', declared_employee_count: null },
];

describe('fake employees', () => {
  it('is deterministic for a seed value and respects the schema rules', () => {
    const first = fakeEmployees(clients, 7, organizationId, userId);
    const second = fakeEmployees(clients, 7, organizationId, userId);
    expect(second).toEqual(first);
    expect(fakeEmployees(clients, 8, organizationId, userId)).not.toEqual(first);
    // Capped at sixty per client, three when the headcount is unknown.
    expect(first.filter((row) => row.client_id === clients[0]!.id)).toHaveLength(4);
    expect(first.filter((row) => row.client_id === clients[1]!.id)).toHaveLength(60);
    expect(first.filter((row) => row.client_id === clients[2]!.id)).toHaveLength(3);
    expect(new Set(first.map((row) => row.id)).size).toBe(first.length);
    for (const client of clients) {
      const ofClient = first.filter((row) => row.client_id === client.id);
      const cnps = ofClient.map((row) => row.cnp).filter(Boolean);
      expect(new Set(cnps).size).toBe(cnps.length);
      const numbers = ofClient.map((row) => row.employee_number).filter(Boolean);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    expect(first.some((row) => row.cnp === null)).toBe(true);
    expect(first.some((row) => row.email === null)).toBe(true);
    for (const row of first) {
      expect(row.organization_id).toBe(organizationId);
      expect(row.created_by).toBe(userId);
      if (row.cnp) expect(isValidCnp(row.cnp)).toBe(true);
      expect((row.status === 'terminated') === (row.terminated_at != null)).toBe(true);
      if (row.terminated_at) expect(row.terminated_at >= row.hired_at).toBe(true);
      if (row.birth_date) expect(row.birth_date < row.hired_at).toBe(true);
      const body = createEmployeeRequestSchema.safeParse({
        lastName: row.last_name,
        firstName: row.first_name,
        cnp: row.cnp,
        employeeNumber: row.employee_number,
        email: row.email,
        phone: row.phone,
        jobTitle: row.job_title,
        hiredAt: row.hired_at,
        birthDate: row.birth_date,
        birthPlace: row.birth_place,
        homeAddress: row.home_address,
        bloodGroup: row.blood_group,
        rhFactor: row.rh_factor,
        notes: row.notes,
      });
      expect(body.error?.issues).toBeUndefined();
    }
  });
});

describe('seed writes', () => {
  it('upserts employees on their id and skips the request when there is nothing to write', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const db = createClient<Database>('https://example.supabase.co', 'sb_secret_test', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchMock },
    });
    expect(await seedEmployees(db, [])).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock
      .mockResolvedValueOnce(Response.json([{ id: 'a' }, { id: 'b' }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const rows = fakeEmployees([clients[0]!], 1, organizationId, userId).slice(0, 2);
    expect(await seedEmployees(db, rows)).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('on_conflict')).toBe('id');
    expect(JSON.parse(String(init?.body))).toHaveLength(2);
    // No employee names a job position: the database assigns the one named like the title.
    expect(JSON.parse(String(init?.body))[0]).not.toHaveProperty('job_position_id');

    // The office titles among the positions that created are moved to their category.
    const [positionsUrl, positionsInit] = fetchMock.mock.calls[1]!;
    expect(new URL(String(positionsUrl)).pathname).toBe('/rest/v1/job_positions');
    expect(new URL(String(positionsUrl)).searchParams.get('name')).toContain('Contabil');
    expect(JSON.parse(String(positionsInit?.body))).toEqual({
      staff_category: 'technical_administrative',
      work_zone: 'Birou',
    });
  });
});
