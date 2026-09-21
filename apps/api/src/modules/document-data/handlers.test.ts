import {
  apiErrorResponseSchema,
  clientDocumentDetailsResponseSchema,
  organizationContractDetailsResponseSchema,
  organizationLegalDetailsResponseSchema,
  responsiblePersonListResponseSchema,
  responsiblePersonResponseSchema,
  workplaceListResponseSchema,
  workplaceResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro',
};

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'owner@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'owner' };

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const activeClient = { id: clientId, archived_at: null };

const legalDetailsRow = {
  legal_name: 'S.C. SAFETY S.R.L.',
  cui: '1590082',
  trade_register_number: 'J35/1234/2015',
  county_code: 'TM',
  locality: 'Timișoara',
  address_line: 'Str. Lungă 5',
  legal_representative_name: 'Maria Popescu',
  legal_representative_role: 'Administrator',
};

const documentDetailsRow = {
  legal_representative_name: 'Maria Popescu',
  legal_representative_role: 'Administrator',
  periodic_training_minutes: 120,
  administrative_training_interval_months: 6,
  worker_training_interval_months: 3,
  training_first_month: 2,
  training_day_from: 2,
  training_day_to: 7,
};

const workplaceRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  name: 'Sediu social',
  is_registered_office: true,
  county_code: 'B',
  locality: 'București',
  address_line: 'Calea Victoriei 122A',
  created_at: '2026-09-18T10:00:00+00:00',
  updated_at: '2026-09-18T10:00:00+00:00',
};

const employeeId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const responsiblePersonRow = {
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  client_id: clientId,
  employee_id: employeeId,
  full_name: 'Ion Popescu',
  job_title: 'Manager magazin',
  roles: ['workplace_manager', 'first_aid'],
  created_at: '2026-09-18T10:00:00+00:00',
  updated_at: '2026-09-18T10:00:00+00:00',
  employees: { job_title: 'Director magazin' },
};

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;
type Upstream = 'membership' | 'organizations' | 'clients' | 'workplaces' | 'responsiblePersons';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return handlers.membership?.(init, url) ?? Response.json([membership]);
      case '/rest/v1/organizations':
        return handlers.organizations?.(init, url) ?? Response.json(legalDetailsRow);
      case '/rest/v1/clients':
        return handlers.clients?.(init, url) ?? Response.json(activeClient);
      case '/rest/v1/client_workplaces':
        return handlers.workplaces?.(init, url) ?? Response.json([workplaceRow]);
      case '/rest/v1/client_responsible_persons':
        return handlers.responsiblePersons?.(init, url) ?? Response.json([responsiblePersonRow]);
      default:
        throw new Error(`Unexpected upstream request: ${url}`);
    }
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const sentBody = (pathname: string, index = 0) =>
  JSON.parse(String(calls(pathname)[index]![1]?.body)) as Record<string, unknown>;

const request = (path: string, method = 'GET', body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        Authorization: 'Bearer test-access-token',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env
  );

const databaseError = (code: string, status: number) =>
  Response.json({ code, message: 'refused', details: null, hint: null }, { status });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/organization/legal-details', () => {
  it('reads the legal details for any member', async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    const response = await request('/organization/legal-details');
    expect(response.status).toBe(200);
    expect(organizationLegalDetailsResponseSchema.parse(await response.json())).toEqual({
      legalDetails: {
        legalName: 'S.C. SAFETY S.R.L.',
        cui: '1590082',
        tradeRegisterNumber: 'J35/1234/2015',
        countyCode: 'TM',
        locality: 'Timișoara',
        addressLine: 'Str. Lungă 5',
        legalRepresentativeName: 'Maria Popescu',
        legalRepresentativeRole: 'Administrator',
      },
    });
  });

  it('replaces them for an owner, storing the CUI as digits and clearing what is left out', async () => {
    mockUpstream({});
    const response = await request('/organization/legal-details', 'PUT', {
      legalName: ' S.C. SAFETY S.R.L. ',
      cui: 'RO 1590082',
    });
    expect(response.status).toBe(200);
    const [url] = calls('/rest/v1/organizations')[0]!;
    expect(new URL(String(url)).searchParams.get('id')).toBe(`eq.${organizationId}`);
    expect(sentBody('/rest/v1/organizations')).toEqual({
      legal_name: 'S.C. SAFETY S.R.L.',
      cui: '1590082',
      trade_register_number: null,
      county_code: null,
      locality: null,
      address_line: null,
      legal_representative_name: null,
      legal_representative_role: null,
    });
  });

  it('refuses a specialist', async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    const response = await request('/organization/legal-details', 'PUT', { legalName: 'Firma' });
    expect(response.status).toBe(403);
    expect(calls('/rest/v1/organizations')).toHaveLength(0);
  });

  it('refuses a CUI with a wrong control digit', async () => {
    mockUpstream({});
    const response = await request('/organization/legal-details', 'PUT', { cui: '1590083' });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('cui');
  });
});

describe('/organization/contract-details', () => {
  const contractDetailsRow = {
    phone: '0722 776 011',
    iban: 'RO49AAAA1B31007593840000',
    bank_name: 'Banca Transilvania',
    authorization_certificate_number: '17664',
    authorization_certificate_date: '2022-09-30',
    authorization_certificate_issuer: 'Direcția de muncă și protecție socială Timiș',
    vat_payer: true,
    fire_safety_technician_name: null,
    fire_safety_technician_certificate: null,
  };

  it('reads them for an owner', async () => {
    mockUpstream({ organizations: () => Response.json(contractDetailsRow) });
    const response = await request('/organization/contract-details');
    expect(response.status).toBe(200);
    expect(organizationContractDetailsResponseSchema.parse(await response.json())).toEqual({
      contractDetails: {
        phone: '0722 776 011',
        iban: 'RO49AAAA1B31007593840000',
        bankName: 'Banca Transilvania',
        authorizationCertificateNumber: '17664',
        authorizationCertificateDate: '2022-09-30',
        authorizationCertificateIssuer: 'Direcția de muncă și protecție socială Timiș',
        vatPayer: true,
        fireSafetyTechnicianName: null,
        fireSafetyTechnicianCertificate: null,
      },
    });
  });

  it('replaces them, storing the IBAN bare and clearing what is left out', async () => {
    mockUpstream({ organizations: () => Response.json(contractDetailsRow) });
    const response = await request('/organization/contract-details', 'PUT', {
      iban: 'ro49 aaaa 1b31 0075 9384 0000',
      authorizationCertificateDate: '2022-09-30',
    });
    expect(response.status).toBe(200);
    const [url] = calls('/rest/v1/organizations')[0]!;
    expect(new URL(String(url)).searchParams.get('id')).toBe(`eq.${organizationId}`);
    expect(sentBody('/rest/v1/organizations')).toEqual({
      phone: null,
      iban: 'RO49AAAA1B31007593840000',
      bank_name: null,
      authorization_certificate_number: null,
      authorization_certificate_date: '2022-09-30',
      authorization_certificate_issuer: null,
      vat_payer: false,
      fire_safety_technician_name: null,
      fire_safety_technician_certificate: null,
    });
  });

  it.each([
    [{ iban: 'RO48AAAA1B31007593840000' }, 'iban'],
    [{ authorizationCertificateDate: '30.09.2022' }, 'authorizationCertificateDate'],
    [{ phone: '07' }, 'phone'],
  ])('refuses %j', async (body, path) => {
    mockUpstream({});
    const response = await request('/organization/contract-details', 'PUT', body);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(path);
    expect(calls('/rest/v1/organizations')).toHaveLength(0);
  });

  it('is not for specialists, to read or to write', async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await request('/organization/contract-details')).status).toBe(403);
    expect((await request('/organization/contract-details', 'PUT', {})).status).toBe(403);
    expect(calls('/rest/v1/organizations')).toHaveLength(0);
  });
});

describe('/clients/{clientId}/document-details', () => {
  const path = `/clients/${clientId}/document-details`;

  it('reads the role and the training schedule', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path);
    expect(response.status).toBe(200);
    expect(clientDocumentDetailsResponseSchema.parse(await response.json())).toEqual({
      documentDetails: {
        legalRepresentativeName: 'Maria Popescu',
        legalRepresentativeRole: 'Administrator',
        periodicTrainingMinutes: 120,
        administrativeTrainingIntervalMonths: 6,
        workerTrainingIntervalMonths: 3,
        trainingFirstMonth: 2,
        trainingDayFrom: 2,
        trainingDayTo: 7,
      },
    });
  });

  it('replaces them, clearing what is left out', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path, 'PUT', {
      legalRepresentativeName: ' Maria Popescu ',
      legalRepresentativeRole: 'Administrator',
      periodicTrainingMinutes: 120,
    });
    expect(response.status).toBe(200);
    expect(sentBody('/rest/v1/clients')).toEqual({
      legal_representative_name: 'Maria Popescu',
      legal_representative_role: 'Administrator',
      periodic_training_minutes: 120,
      administrative_training_interval_months: null,
      worker_training_interval_months: null,
      training_first_month: null,
      training_day_from: null,
      training_day_to: null,
    });
  });

  it('refuses days out of order and a worker interval above six months', async () => {
    mockUpstream({});
    const days = await request(path, 'PUT', { trainingDayFrom: 12, trainingDayTo: 7 });
    expect(days.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await days.json()).issues?.[0]?.path).toBe('trainingDayTo');
    const interval = await request(path, 'PUT', { workerTrainingIntervalMonths: 12 });
    expect(interval.status).toBe(400);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: () => Response.json(null) });
    expect((await request(path)).status).toBe(404);
    expect((await request(path, 'PUT', {})).status).toBe(404);
  });
});

describe('/clients/{clientId}/workplaces', () => {
  const path = `/clients/${clientId}/workplaces`;

  it('lists active workplaces, the registered office first', async () => {
    mockUpstream({});
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items } = workplaceListResponseSchema.parse(await response.json());
    expect(items).toEqual([
      {
        id: workplaceRow.id,
        clientId,
        name: 'Sediu social',
        isRegisteredOffice: true,
        countyCode: 'B',
        locality: 'București',
        addressLine: 'Calea Victoriei 122A',
        createdAt: '2026-09-18T10:00:00.000Z',
        updatedAt: '2026-09-18T10:00:00.000Z',
      },
    ]);
    const [url] = calls('/rest/v1/client_workplaces')[0]!;
    const query = new URL(String(url)).searchParams;
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('order')).toBe('is_registered_office.desc,name.asc,id.asc');
  });

  it('creates a workplace in the caller`s organization', async () => {
    mockUpstream({ workplaces: () => Response.json(workplaceRow, { status: 201 }) });
    const response = await request(path, 'POST', {
      name: ' Sediu social ',
      isRegisteredOffice: true,
    });
    expect(response.status).toBe(201);
    expect(workplaceResponseSchema.parse(await response.json()).workplace.name).toBe(
      'Sediu social'
    );
    expect(sentBody('/rest/v1/client_workplaces')).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      name: 'Sediu social',
      is_registered_office: true,
      county_code: null,
      locality: null,
      address_line: null,
      created_by: user.id,
    });
  });

  it('refuses an archived client and a second registered office with 409', async () => {
    mockUpstream({ clients: () => Response.json({ id: clientId, archived_at: '2026-09-01' }) });
    expect((await request(path, 'POST', { name: 'Punct de lucru' })).status).toBe(409);
    expect(calls('/rest/v1/client_workplaces')).toHaveLength(0);

    mockUpstream({ workplaces: () => databaseError('23505', 409) });
    const second = await request(path, 'POST', { name: 'Alt sediu', isRegisteredOffice: true });
    expect(second.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await second.json()).message).toContain(
      'registered office'
    );
  });

  it('replaces and archives a workplace, scoped to the client', async () => {
    mockUpstream({ workplaces: () => Response.json(workplaceRow) });
    const item = `${path}/${workplaceRow.id}`;
    expect((await request(item, 'PUT', { name: 'Sediu' })).status).toBe(200);
    expect((await request(item, 'DELETE')).status).toBe(204);
    for (const [url] of calls('/rest/v1/client_workplaces')) {
      const query = new URL(String(url)).searchParams;
      expect(query.get('id')).toBe(`eq.${workplaceRow.id}`);
      expect(query.get('client_id')).toBe(`eq.${clientId}`);
      expect(query.get('archived_at')).toBe('is.null');
    }
    expect(sentBody('/rest/v1/client_workplaces', 1)).toHaveProperty('archived_at');
  });

  it('answers 404 for a workplace that is not there', async () => {
    mockUpstream({ workplaces: () => Response.json(null) });
    const item = `${path}/${workplaceRow.id}`;
    expect((await request(item, 'PUT', { name: 'Sediu' })).status).toBe(404);
    expect((await request(item, 'DELETE')).status).toBe(404);
  });
});

describe('/clients/{clientId}/responsible-persons', () => {
  const path = `/clients/${clientId}/responsible-persons`;
  const body = {
    employeeId,
    fullName: 'Ion Popescu',
    jobTitle: 'Manager magazin',
    roles: ['workplace_manager', 'first_aid'],
  };

  it('lists active responsible persons by name', async () => {
    mockUpstream({});
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items } = responsiblePersonListResponseSchema.parse(await response.json());
    expect(items[0]).toMatchObject({
      fullName: 'Ion Popescu',
      employeeId,
      roles: body.roles,
      jobTitle: 'Manager magazin',
      employeeJobTitle: 'Director magazin',
    });
    const [url] = calls('/rest/v1/client_responsible_persons')[0]!;
    expect(new URL(String(url)).searchParams.get('select')).toContain('employees(job_title)');
    expect(new URL(String(url)).searchParams.get('order')).toBe('full_name.asc,id.asc');
  });

  it('creates one, with or without an employee', async () => {
    mockUpstream({
      responsiblePersons: () => Response.json(responsiblePersonRow, { status: 201 }),
    });
    const response = await request(path, 'POST', { ...body, employeeId: undefined });
    expect(response.status).toBe(201);
    responsiblePersonResponseSchema.parse(await response.json());
    expect(sentBody('/rest/v1/client_responsible_persons')).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      employee_id: null,
      full_name: 'Ion Popescu',
      job_title: 'Manager magazin',
      roles: ['workplace_manager', 'first_aid'],
      created_by: user.id,
    });
  });

  it('refuses no role, an unknown role, and a role given twice', async () => {
    mockUpstream({});
    for (const roles of [[], ['janitor'], ['first_aid', 'first_aid']]) {
      expect((await request(path, 'POST', { ...body, roles })).status).toBe(400);
    }
    expect(calls('/rest/v1/client_responsible_persons')).toHaveLength(0);
  });

  it('names the employee field when the employee is of another client', async () => {
    mockUpstream({ responsiblePersons: () => databaseError('23503', 409) });
    const response = await request(path, 'POST', body);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'employeeId'
    );
  });

  it('answers 409 when the employee already is a responsible person', async () => {
    mockUpstream({ responsiblePersons: () => databaseError('23505', 409) });
    expect((await request(path, 'POST', body)).status).toBe(409);
    expect((await request(`${path}/${responsiblePersonRow.id}`, 'PUT', body)).status).toBe(409);
  });

  it('replaces and archives one, and answers 404 when it is not there', async () => {
    const item = `${path}/${responsiblePersonRow.id}`;
    mockUpstream({ responsiblePersons: () => Response.json(responsiblePersonRow) });
    expect((await request(item, 'PUT', body)).status).toBe(200);
    expect((await request(item, 'DELETE')).status).toBe(204);

    mockUpstream({ responsiblePersons: () => Response.json(null) });
    expect((await request(item, 'PUT', body)).status).toBe(404);
    expect((await request(item, 'DELETE')).status).toBe(404);
  });
});
