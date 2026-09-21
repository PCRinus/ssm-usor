import { caenClassName, isValidCui } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { fakeClients, fakeLeads, seedClients } from './seed-clients';
import { seedOrganization, seedOrganizationId } from './seed-organization';

const organizationId = '11111111-2222-4333-8444-555555555555';
const userId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';

describe('fake clients', () => {
  it('is deterministic for a seed value and produces valid, unique CUIs', () => {
    const first = fakeClients(30, 7, organizationId, userId);
    const second = fakeClients(30, 7, organizationId, userId);
    expect(second).toEqual(first);
    expect(fakeClients(30, 8, organizationId, userId)).not.toEqual(first);
    expect(new Set(first.map((row) => row.cui)).size).toBe(30);
    for (const row of first) {
      expect(isValidCui(row.cui)).toBe(true);
      expect(row.organization_id).toBe(organizationId);
      expect(row.created_by).toBe(userId);
      expect(row.legal_name.length).toBeGreaterThan(2);
      if (row.caen_code) expect(caenClassName(row.caen_code)).not.toBeNull();
      expect(row.declared_employee_count).toBeGreaterThan(0);
    }
  });
});

describe('fake leads', () => {
  it('is deterministic, leaves the clients of the same seed as they were, and fits the database', () => {
    const clients = fakeClients(5, 7, organizationId, userId);
    const leads = fakeLeads(4, 7, organizationId, userId);
    expect(fakeLeads(4, 7, organizationId, userId)).toEqual(leads);
    expect(fakeClients(5, 7, organizationId, userId)).toEqual(clients);
    for (const row of leads) {
      expect(row.stage).toBe('lead');
      expect(isValidCui(row.cui)).toBe(true);
      expect(row.contact_name!.length).toBeGreaterThanOrEqual(2);
      expect(row.contact_phone).toMatch(/^07[0-9]{8}$/);
      if (row.contact_email) expect(row.contact_email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
    expect(leads[0]!.contact_email).toBeNull();
  });
});

describe('seed writes', () => {
  function fixture() {
    const fetchMock = vi.fn<typeof fetch>();
    const db = createClient<Database>('https://example.supabase.co', 'sb_secret_test', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchMock },
    });
    return { db, fetchMock };
  }

  it('upserts the organization, the owner membership, and the owner profile', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: seedOrganizationId, name: 'SSM Ușor' }))
      .mockResolvedValueOnce(
        Response.json({ user_id: userId, organization_id: seedOrganizationId, role: 'owner' })
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const result = await seedOrganization(db, 'SSM Ușor', userId, 'Ana Admin');
    expect(result.membership.role).toBe('owner');
    const [organizationUrl, organizationInit] = fetchMock.mock.calls[0]!;
    expect(String(organizationUrl)).toContain('/rest/v1/organizations');
    expect(new Headers(organizationInit?.headers).get('Prefer')).toContain(
      'resolution=merge-duplicates'
    );
    expect(JSON.parse(String(organizationInit?.body))).toEqual({
      id: seedOrganizationId,
      name: 'SSM Ușor',
    });
    const [, membershipInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(membershipInit?.body))).toEqual({
      user_id: userId,
      organization_id: seedOrganizationId,
      role: 'owner',
    });
    // An existing profile keeps the name its owner chose.
    const [profileUrl, profileInit] = fetchMock.mock.calls[2]!;
    expect(String(profileUrl)).toContain('/rest/v1/profiles');
    expect(new Headers(profileInit?.headers).get('Prefer')).toContain(
      'resolution=ignore-duplicates'
    );
    expect(JSON.parse(String(profileInit?.body))).toEqual({
      user_id: userId,
      full_name: 'Ana Admin',
    });
  });

  it('upserts clients on the organization and CUI', async () => {
    const { db, fetchMock } = fixture();
    const stored = [
      { id: 'a', declared_employee_count: 4 },
      { id: 'b', declared_employee_count: null },
    ];
    fetchMock.mockResolvedValueOnce(Response.json(stored));
    const rows = fakeClients(2, 1, organizationId, userId);
    expect(await seedClients(db, rows)).toEqual(stored);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('on_conflict')).toBe('organization_id,cui');
    expect(JSON.parse(String(init?.body))).toHaveLength(2);
  });

  it('surfaces database errors', async () => {
    const { db, fetchMock } = fixture();
    fetchMock.mockResolvedValue(Response.json({ message: 'permission denied' }, { status: 403 }));
    await expect(seedOrganization(db, 'SSM Ușor', userId, 'Ana Admin')).rejects.toThrow(
      'permission denied'
    );
  });
});
