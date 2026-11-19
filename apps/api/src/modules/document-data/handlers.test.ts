import {
  apiErrorResponseSchema,
  clientDocumentDetailsResponseSchema,
  organizationAuthorizationsResponseSchema,
  organizationCompanyDetailsResponseSchema,
  responsiblePersonListResponseSchema,
  responsiblePersonResponseSchema,
  workplaceListResponseSchema,
  workplaceResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  membershipRow,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testOrganizationId as organizationId,
  testUser as user,
} from '../../test/upstream';

const env = testEnv({ CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro' });

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const activeClient = { id: clientId, archived_at: null };

const companyDetailsRow = {
  legal_name: 'S.C. SAFETY S.R.L.',
  cui: '1590082',
  vat_payer: true,
  trade_register_number: 'J35/1234/2015',
  county_code: 'TM',
  locality: 'Timișoara',
  address_line: 'Str. Lungă 5',
  phone: '0722 776 011',
  legal_representative_name: 'Maria Popescu',
  legal_representative_role: 'Administrator',
  iban: 'RO49AAAA1B31007593840000',
  bank_name: 'Banca Transilvania',
};

const employeeId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const documentDetailsRow = {
  legal_representative_name: 'Maria Popescu',
  legal_representative_role: 'Administrator',
  legal_representative_employee_id: null,
  legal_representative_employee: null,
  periodic_training_minutes: 120,
  administrative_training_interval_months: 6,
  administrative_training_not_applicable: false,
  worker_training_interval_months: 3,
  worker_training_not_applicable: false,
  training_first_month: 2,
  training_day_from: 2,
  training_day_to: 7,
};

const workplaceRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  name: 'Sediu social',
  is_registered_office: true,
  office_has_activity: true,
  county_code: 'B',
  locality: 'București',
  address_line: 'Calea Victoriei 122A',
  activity: 'Birouri',
  kind: 'fixed_space',
  floor_area_m2: 120,
  extinguisher_norm: 'administrative_300',
  assembly_point: 'Parcarea din fața clădirii',
  combustible_materials: 'Hârtie, mobilier din lemn',
  ignition_sources: 'Aparatură electrică',
  fire_risk_equipment: 'Calculatoare, imprimante',
  specific_measures: null,
  created_at: '2026-09-18T10:00:00+00:00',
  updated_at: '2026-09-18T10:00:00+00:00',
};

const responsiblePersonRow = {
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  client_id: clientId,
  employee_id: employeeId,
  full_name: 'Ion Popescu',
  job_title: 'Manager magazin',
  roles: ['workplace_manager', 'first_aid'],
  workplace_id: null,
  created_at: '2026-09-18T10:00:00+00:00',
  updated_at: '2026-09-18T10:00:00+00:00',
  employees: { job_title: 'Director magazin', status: 'active', archived_at: null },
};

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;
type Upstream =
  | 'membership'
  | 'organizations'
  | 'clients'
  | 'employees'
  | 'workplaces'
  | 'workplaceList'
  | 'employeeList'
  | 'responsiblePersons';

function mockUpstream(handlers: Partial<Record<Upstream, Handler>>) {
  mockSignedInUpstream({
    '/rest/v1/rpc/current_membership': ({ init, url }) =>
      handlers.membership?.(init, url) ?? Response.json([membershipRow({ role: 'owner' })]),
    '/rest/v1/organizations': ({ init, url }) =>
      handlers.organizations?.(init, url) ?? Response.json(companyDetailsRow),
    '/rest/v1/clients': ({ init, url }) =>
      handlers.clients?.(init, url) ?? Response.json(activeClient),
    '/rest/v1/employees': ({ init, url }) =>
      handlers.employees?.(init, url) ?? Response.json({ id: employeeId }),
    '/rest/v1/client_workplaces': ({ init, url }) =>
      handlers.workplaces?.(init, url) ?? Response.json([workplaceRow]),
    '/rest/v1/client_workplace_list': ({ init, url }) =>
      handlers.workplaceList?.(init, url) ??
      Response.json([{ ...workplaceRow, current_employee_count: 16 }]),
    '/rest/v1/employee_list': ({ init, url }) =>
      handlers.employeeList?.(init, url) ??
      Response.json([{ id: employeeId, portal_state: 'invited' }]),
    '/rest/v1/client_responsible_persons': ({ init, url }) =>
      handlers.responsiblePersons?.(init, url) ?? Response.json([responsiblePersonRow]),
  });
}

const request = (path: string, method = 'GET', body?: unknown) =>
  apiRequest(path, { method, body }, env);

const databaseError = (code: string, status: number) =>
  Response.json({ code, message: 'refused', details: null, hint: null }, { status });

stubFetch();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/organization/company-details', () => {
  it('reads them for any member', async () => {
    mockUpstream({ membership: () => Response.json([membershipRow({ role: 'specialist' })]) });
    const response = await request('/organization/company-details');
    expect(response.status).toBe(200);
    expect(organizationCompanyDetailsResponseSchema.parse(await response.json())).toEqual({
      companyDetails: {
        legalName: 'S.C. SAFETY S.R.L.',
        cui: '1590082',
        vatPayer: true,
        tradeRegisterNumber: 'J35/1234/2015',
        countyCode: 'TM',
        locality: 'Timișoara',
        addressLine: 'Str. Lungă 5',
        phone: '0722 776 011',
        legalRepresentativeName: 'Maria Popescu',
        legalRepresentativeRole: 'Administrator',
        iban: 'RO49AAAA1B31007593840000',
        bankName: 'Banca Transilvania',
      },
    });
  });

  it('replaces them for an owner, storing the CUI and the IBAN bare and clearing what is left out', async () => {
    mockUpstream({});
    const response = await request('/organization/company-details', 'PUT', {
      legalName: ' S.C. SAFETY S.R.L. ',
      cui: 'RO 1590082',
      iban: 'ro49 aaaa 1b31 0075 9384 0000',
    });
    expect(response.status).toBe(200);
    const { url } = callsTo('/rest/v1/organizations')[0]!;
    expect(url.searchParams.get('id')).toBe(`eq.${organizationId}`);
    expect(callsTo('/rest/v1/organizations')[0]!.body).toEqual({
      legal_name: 'S.C. SAFETY S.R.L.',
      cui: '1590082',
      vat_payer: false,
      trade_register_number: null,
      county_code: null,
      locality: null,
      address_line: null,
      phone: null,
      legal_representative_name: null,
      legal_representative_role: null,
      iban: 'RO49AAAA1B31007593840000',
      bank_name: null,
    });
  });

  it('refuses a specialist', async () => {
    mockUpstream({ membership: () => Response.json([membershipRow({ role: 'specialist' })]) });
    const response = await request('/organization/company-details', 'PUT', { legalName: 'Firma' });
    expect(response.status).toBe(403);
    expect(callsTo('/rest/v1/organizations')).toHaveLength(0);
  });

  it.each([
    [{ cui: '1590083' }, 'cui'],
    [{ iban: 'RO48AAAA1B31007593840000' }, 'iban'],
    [{ phone: '07' }, 'phone'],
  ])('refuses %j', async (body, path) => {
    mockUpstream({});
    const response = await request('/organization/company-details', 'PUT', body);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(path);
    expect(callsTo('/rest/v1/organizations')).toHaveLength(0);
  });
});

describe('/organization/authorizations', () => {
  const authorizationsRow = {
    authorization_certificate_number: '17664',
    authorization_certificate_date: '2022-09-30',
    authorization_certificate_issuer: 'Direcția de muncă și protecție socială Timiș',
    fire_safety_technician_name: 'Radu Stan',
    fire_safety_technician_certificate: 'CT 123/2024',
    fire_safety_authorization: 'nr. 12 din 15.09.2026, ISU Cluj',
    risk_evaluator_name: 'Ing. Maria IONESCU',
    risk_evaluator_title: 'evaluator de riscuri atestat',
    risk_evaluator_certificate: null,
  };

  it('reads them for any member', async () => {
    mockUpstream({
      membership: () => Response.json([membershipRow({ role: 'specialist' })]),
      organizations: () => Response.json(authorizationsRow),
    });
    const response = await request('/organization/authorizations');
    expect(response.status).toBe(200);
    expect(organizationAuthorizationsResponseSchema.parse(await response.json())).toEqual({
      authorizations: {
        authorizationCertificateNumber: '17664',
        authorizationCertificateDate: '2022-09-30',
        authorizationCertificateIssuer: 'Direcția de muncă și protecție socială Timiș',
        fireSafetyTechnicianName: 'Radu Stan',
        fireSafetyTechnicianCertificate: 'CT 123/2024',
        fireSafetyAuthorization: 'nr. 12 din 15.09.2026, ISU Cluj',
        riskEvaluatorName: 'Ing. Maria IONESCU',
        riskEvaluatorTitle: 'evaluator de riscuri atestat',
        riskEvaluatorCertificate: null,
      },
    });
  });

  it('replaces them for an owner, clearing what is left out', async () => {
    mockUpstream({ organizations: () => Response.json(authorizationsRow) });
    const response = await request('/organization/authorizations', 'PUT', {
      authorizationCertificateDate: '2022-09-30',
    });
    expect(response.status).toBe(200);
    const { url } = callsTo('/rest/v1/organizations')[0]!;
    expect(url.searchParams.get('id')).toBe(`eq.${organizationId}`);
    expect(callsTo('/rest/v1/organizations')[0]!.body).toEqual({
      authorization_certificate_number: null,
      authorization_certificate_date: '2022-09-30',
      authorization_certificate_issuer: null,
      fire_safety_technician_name: null,
      fire_safety_technician_certificate: null,
      fire_safety_authorization: null,
      risk_evaluator_name: null,
      risk_evaluator_title: null,
      risk_evaluator_certificate: null,
    });
  });

  it('saves the risk evaluator, and refuses a name without a title or a title without a name', async () => {
    mockUpstream({ organizations: () => Response.json(authorizationsRow) });
    await request('/organization/authorizations', 'PUT', {
      riskEvaluatorName: ' Ing. Maria IONESCU ',
      riskEvaluatorTitle: 'evaluator de riscuri atestat',
      riskEvaluatorCertificate: 'seria A nr. 1842/2024',
    });
    expect(callsTo('/rest/v1/organizations')[0]!.body).toMatchObject({
      risk_evaluator_name: 'Ing. Maria IONESCU',
      risk_evaluator_title: 'evaluator de riscuri atestat',
      risk_evaluator_certificate: 'seria A nr. 1842/2024',
    });

    for (const [body, path] of [
      [{ riskEvaluatorName: 'Ing. Maria IONESCU' }, 'riskEvaluatorTitle'],
      [{ riskEvaluatorTitle: 'evaluator de riscuri atestat' }, 'riskEvaluatorName'],
    ] as const) {
      const response = await request('/organization/authorizations', 'PUT', body);
      expect(response.status).toBe(400);
      expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(path);
    }
    expect(callsTo('/rest/v1/organizations')).toHaveLength(1);
  });

  it('saves the fire-safety authorization trimmed, and refuses one longer than 200 characters', async () => {
    mockUpstream({ organizations: () => Response.json(authorizationsRow) });
    await request('/organization/authorizations', 'PUT', {
      fireSafetyTechnicianName: 'Radu Stan',
      fireSafetyAuthorization: ' nr. 12 din 15.09.2026, ISU Cluj ',
    });
    expect(callsTo('/rest/v1/organizations')[0]!.body).toMatchObject({
      fire_safety_technician_name: 'Radu Stan',
      fire_safety_authorization: 'nr. 12 din 15.09.2026, ISU Cluj',
    });

    const response = await request('/organization/authorizations', 'PUT', {
      fireSafetyAuthorization: 'x'.repeat(201),
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'fireSafetyAuthorization'
    );
    expect(callsTo('/rest/v1/organizations')).toHaveLength(1);
  });

  it('refuses a date that is not one', async () => {
    mockUpstream({});
    const response = await request('/organization/authorizations', 'PUT', {
      authorizationCertificateDate: '30.09.2022',
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'authorizationCertificateDate'
    );
    expect(callsTo('/rest/v1/organizations')).toHaveLength(0);
  });

  it('refuses a specialist who writes', async () => {
    mockUpstream({ membership: () => Response.json([membershipRow({ role: 'specialist' })]) });
    expect((await request('/organization/authorizations', 'PUT', {})).status).toBe(403);
    expect(callsTo('/rest/v1/organizations')).toHaveLength(0);
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
        legalRepresentativeEmployeeId: null,
        legalRepresentativeEmployee: null,
        periodicTrainingMinutes: 120,
        administrativeTrainingIntervalMonths: 6,
        administrativeTrainingNotApplicable: false,
        workerTrainingIntervalMonths: 3,
        workerTrainingNotApplicable: false,
        trainingFirstMonth: 2,
        trainingDayFrom: 2,
        trainingDayTo: 7,
      },
    });
  });

  it('changes only the fields sent, leaving the others as saved', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path, 'PATCH', {
      legalRepresentativeName: ' Maria Popescu ',
      legalRepresentativeRole: 'Administrator',
      periodicTrainingMinutes: 120,
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/clients')[0]!.body).toEqual({
      legal_representative_name: 'Maria Popescu',
      legal_representative_role: 'Administrator',
      periodic_training_minutes: 120,
    });
  });

  it('clears a field sent as null', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path, 'PATCH', {
      legalRepresentativeRole: null,
      trainingDayFrom: null,
      trainingDayTo: null,
      workerTrainingIntervalMonths: null,
      workerTrainingNotApplicable: false,
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/clients')[0]!.body).toEqual({
      legal_representative_role: null,
      training_day_from: null,
      training_day_to: null,
      worker_training_interval_months: null,
      worker_training_not_applicable: false,
    });
  });

  it('refuses a body with nothing to change, and a day or an interval sent without its pair', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    expect((await request(path, 'PATCH', {})).status).toBe(400);
    expect((await request(path, 'PATCH', { trainingDayTo: 9 })).status).toBe(400);
    expect((await request(path, 'PATCH', { workerTrainingNotApplicable: true })).status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it("links the representative to one of the client's current employees, and reads them back", async () => {
    mockUpstream({
      clients: () =>
        Response.json({
          ...documentDetailsRow,
          legal_representative_employee_id: employeeId,
          legal_representative_employee: {
            id: employeeId,
            last_name: 'Popescu',
            first_name: 'Maria',
            job_title: 'Tâmplar',
          },
        }),
    });
    const response = await request(path, 'PATCH', {
      legalRepresentativeName: 'Maria Popescu',
      legalRepresentativeRole: 'Administrator',
      legalRepresentativeEmployeeId: employeeId,
    });
    expect(response.status).toBe(200);
    const lookup = callsTo('/rest/v1/employees')[0]!.url;
    expect(lookup.searchParams.get('id')).toBe(`eq.${employeeId}`);
    expect(lookup.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(lookup.searchParams.get('archived_at')).toBe('is.null');
    expect(callsTo('/rest/v1/clients')[0]!.body).toMatchObject({
      legal_representative_employee_id: employeeId,
    });
    expect(clientDocumentDetailsResponseSchema.parse(await response.json())).toMatchObject({
      documentDetails: {
        legalRepresentativeEmployeeId: employeeId,
        legalRepresentativeEmployee: {
          id: employeeId,
          lastName: 'Popescu',
          firstName: 'Maria',
          jobTitle: 'Tâmplar',
        },
      },
    });
  });

  it('refuses an employee who is not a current employee of the client', async () => {
    mockUpstream({ employees: () => Response.json(null) });
    const response = await request(path, 'PATCH', { legalRepresentativeEmployeeId: employeeId });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'legalRepresentativeEmployeeId'
    );
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('refuses days out of order and a worker interval above six months', async () => {
    mockUpstream({});
    const days = await request(path, 'PATCH', { trainingDayFrom: 12, trainingDayTo: 7 });
    expect(days.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await days.json()).issues?.[0]?.path).toBe('trainingDayTo');
    const interval = await request(path, 'PATCH', {
      workerTrainingIntervalMonths: 12,
      workerTrainingNotApplicable: false,
    });
    expect(interval.status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('takes every month from one to six for execution staff', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path, 'PATCH', {
      workerTrainingIntervalMonths: 5,
      workerTrainingNotApplicable: false,
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/clients')[0]!.body).toMatchObject({
      worker_training_interval_months: 5,
    });
  });

  it('refuses a technical-administrative interval outside the list, even the saved one', async () => {
    mockUpstream({
      clients: () =>
        Response.json({ ...documentDetailsRow, administrative_training_interval_months: 9 }),
    });
    const response = await request(path, 'PATCH', {
      administrativeTrainingIntervalMonths: 9,
      administrativeTrainingNotApplicable: false,
      legalRepresentativeRole: 'Director',
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'administrativeTrainingIntervalMonths'
    );
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('saves an explicit category exclusion without inventing an interval', async () => {
    mockUpstream({ clients: () => Response.json(documentDetailsRow) });
    const response = await request(path, 'PATCH', {
      administrativeTrainingIntervalMonths: 6,
      administrativeTrainingNotApplicable: false,
      workerTrainingIntervalMonths: null,
      workerTrainingNotApplicable: true,
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/clients')[0]!.body).toEqual({
      administrative_training_interval_months: 6,
      administrative_training_not_applicable: false,
      worker_training_interval_months: null,
      worker_training_not_applicable: true,
    });
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: () => Response.json(null) });
    expect((await request(path)).status).toBe(404);
    expect((await request(path, 'PATCH', { legalRepresentativeRole: 'Director' })).status).toBe(
      404
    );
  });
});

describe('/clients/{clientId}/workplaces', () => {
  const path = `/clients/${clientId}/workplaces`;

  it('lists active workplaces, the registered office first, with their current employees', async () => {
    mockUpstream({
      employees: () => new Response(null, { status: 200, headers: { 'Content-Range': '*/2' } }),
    });
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items, unassignedEmployeeCount } = workplaceListResponseSchema.parse(
      await response.json()
    );
    expect(unassignedEmployeeCount).toBe(2);
    expect(items).toEqual([
      {
        id: workplaceRow.id,
        clientId,
        name: 'Sediu social',
        isRegisteredOffice: true,
        officeHasActivity: true,
        countyCode: 'B',
        locality: 'București',
        addressLine: 'Calea Victoriei 122A',
        activity: 'Birouri',
        kind: 'fixed_space',
        floorAreaM2: 120,
        extinguisherNorm: 'administrative_300',
        assemblyPoint: 'Parcarea din fața clădirii',
        combustibleMaterials: 'Hârtie, mobilier din lemn',
        ignitionSources: 'Aparatură electrică',
        fireRiskEquipment: 'Calculatoare, imprimante',
        specificMeasures: null,
        createdAt: '2026-09-18T10:00:00.000Z',
        updatedAt: '2026-09-18T10:00:00.000Z',
        currentEmployeeCount: 16,
      },
    ]);
    const { url } = callsTo('/rest/v1/client_workplace_list')[0]!;
    const query = url.searchParams;
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('order')).toBe('is_registered_office.desc,name.asc,id.asc');
    const { url: countUrl, init: countInit } = callsTo('/rest/v1/employees')[0]!;
    expect(countInit?.method).toBe('HEAD');
    const counted = countUrl.searchParams;
    expect(counted.get('client_id')).toBe(`eq.${clientId}`);
    expect(counted.get('workplace_id')).toBe('is.null');
    expect(counted.get('status')).toBe('eq.active');
    expect(counted.get('archived_at')).toBe('is.null');
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
    expect(callsTo('/rest/v1/client_workplaces')[0]!.body).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      name: 'Sediu social',
      is_registered_office: true,
      office_has_activity: true,
      county_code: null,
      locality: null,
      address_line: null,
      activity: null,
      kind: 'fixed_space',
      floor_area_m2: null,
      extinguisher_norm: null,
      assembly_point: null,
      combustible_materials: null,
      ignition_sources: null,
      fire_risk_equipment: null,
      specific_measures: null,
      created_by: user.id,
    });
  });

  it('stores the fire-safety facts of a workplace and clears those left out', async () => {
    mockUpstream({ workplaces: () => Response.json(workplaceRow) });
    const response = await request(`${path}/${workplaceRow.id}`, 'PUT', {
      name: 'Gelaterie',
      activity: ' Gelaterie ',
      floorAreaM2: 85,
      extinguisherNorm: 'commercial_200',
      assemblyPoint: 'Parcarea din fața magazinului',
      combustibleMaterials: 'Ambalaje de carton',
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/client_workplaces')[0]!.body).toMatchObject({
      activity: 'Gelaterie',
      floor_area_m2: 85,
      extinguisher_norm: 'commercial_200',
      assembly_point: 'Parcarea din fața magazinului',
      combustible_materials: 'Ambalaje de carton',
      ignition_sources: null,
      fire_risk_equipment: null,
      specific_measures: null,
    });
  });

  it('stores a mobile site with no norm, and keeps an area typed before', async () => {
    mockUpstream({ workplaces: () => Response.json(workplaceRow) });
    const response = await request(`${path}/${workplaceRow.id}`, 'PUT', {
      name: 'Șantier Dumbrăvița',
      kind: 'mobile_site',
      floorAreaM2: 85,
      extinguisherNorm: 'none',
    });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/client_workplaces')[0]!.body).toMatchObject({
      kind: 'mobile_site',
      floor_area_m2: 85,
      extinguisher_norm: 'none',
    });
  });

  it('refuses an area of nothing, a norm annex 6 does not have and an unknown kind', async () => {
    mockUpstream({});
    for (const fields of [
      { floorAreaM2: 0 },
      { extinguisherNorm: 'commercial_250' },
      { kind: 'vehicle' },
    ]) {
      expect((await request(path, 'POST', { name: 'Gelaterie', ...fields })).status).toBe(400);
    }
    expect(callsTo('/rest/v1/client_workplaces')).toHaveLength(0);
  });

  it('refuses an archived client and a second registered office with 409', async () => {
    mockUpstream({ clients: () => Response.json({ id: clientId, archived_at: '2026-09-01' }) });
    const archived = await request(path, 'POST', { name: 'Punct de lucru' });
    expect(archived.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');
    expect(callsTo('/rest/v1/client_workplaces')).toHaveLength(0);

    mockUpstream({ workplaces: () => databaseError('23505', 409) });
    const second = await request(path, 'POST', { name: 'Alt sediu', isRegisteredOffice: true });
    expect(second.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await second.json()).message).toContain(
      'registered office'
    );
  });

  it('passes on the refusal of the database for an archived client on a change', async () => {
    mockUpstream({
      workplaces: (init) =>
        init?.method === 'PATCH' ? databaseError('CLA01', 400) : Response.json([workplaceRow]),
    });
    const response = await request(`${path}/${workplaceRow.id}`, 'PUT', { name: 'Sediu' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

  it('replaces and archives a workplace, scoped to the client', async () => {
    mockUpstream({
      workplaces: (init) =>
        init?.method === 'PATCH' ? Response.json(workplaceRow) : Response.json([workplaceRow]),
    });
    const item = `${path}/${workplaceRow.id}`;
    expect((await request(item, 'PUT', { name: 'Sediu' })).status).toBe(200);
    expect((await request(item, 'DELETE')).status).toBe(204);
    const writes = callsTo('/rest/v1/client_workplaces').filter((call) => call.method === 'PATCH');
    expect(writes).toHaveLength(2);
    for (const { url } of writes) {
      const query = url.searchParams;
      expect(query.get('id')).toBe(`eq.${workplaceRow.id}`);
      expect(query.get('client_id')).toBe(`eq.${clientId}`);
      expect(query.get('archived_at')).toBe('is.null');
    }
    expect(writes[1]!.body).toHaveProperty('archived_at');
  });

  describe('a registered office with no activity (ADR 041)', () => {
    const item = `${path}/${workplaceRow.id}`;
    const pointOfWork = { id: '9b2c4f1e-7a3d-4c5b-8e6f-0a1b2c3d4e5f' };
    const noActivity = { name: 'Sediu social', isRegisteredOffice: true, officeHasActivity: false };
    const reasonOf = async (response: Response) =>
      apiErrorResponseSchema.parse(await response.json());

    it('is stored beside another active workplace that nobody is assigned away from', async () => {
      mockUpstream({
        workplaces: (init) =>
          init?.method === 'PATCH'
            ? Response.json({ ...workplaceRow, office_has_activity: false })
            : Response.json([pointOfWork]),
        employees: () => new Response(null, { headers: { 'Content-Range': '*/0' } }),
      });
      const response = await request(item, 'PUT', noActivity);
      expect(response.status).toBe(200);
      expect(workplaceResponseSchema.parse(await response.json()).workplace.officeHasActivity).toBe(
        false
      );
      const [others] = callsTo('/rest/v1/client_workplaces');
      const query = others!.url.searchParams;
      expect(query.get('is_registered_office')).toBe('eq.false');
      expect(query.get('id')).toBe(`neq.${workplaceRow.id}`);
      const [employees] = callsTo('/rest/v1/employees');
      const counted = employees!.url.searchParams;
      expect(counted.get('workplace_id')).toBe(`eq.${workplaceRow.id}`);
      expect(counted.get('status')).toBe('eq.active');
      const writes = callsTo('/rest/v1/client_workplaces').filter(
        (call) => call.method === 'PATCH'
      );
      expect(writes[0]!.body).toMatchObject({
        is_registered_office: true,
        office_has_activity: false,
      });
    });

    it('is refused on a point of work, which is archived instead', async () => {
      mockUpstream({});
      const response = await request(item, 'PUT', {
        name: 'Atelier',
        isRegisteredOffice: false,
        officeHasActivity: false,
      });
      expect(response.status).toBe(400);
      expect(callsTo('/rest/v1/client_workplaces')).toHaveLength(0);
    });

    it('is refused while the office is the only active workplace', async () => {
      mockUpstream({ workplaces: () => Response.json([]) });
      for (const response of [
        await request(item, 'PUT', noActivity),
        await request(path, 'POST', noActivity),
      ]) {
        expect(response.status).toBe(409);
        expect((await reasonOf(response)).reason).toBe('office_needs_workplace');
      }
      expect(callsTo('/rest/v1/client_workplaces').filter((call) => call.method !== 'GET')).toEqual(
        []
      );
    });

    it('is refused while current employees work at the office, saying how many', async () => {
      mockUpstream({
        workplaces: () => Response.json([pointOfWork]),
        employees: () => new Response(null, { headers: { 'Content-Range': '*/2' } }),
      });
      const response = await request(item, 'PUT', noActivity);
      expect(response.status).toBe(409);
      expect(await reasonOf(response)).toMatchObject({
        reason: 'office_has_employees',
        employeeCount: 2,
      });
    });

    it('answers with the reason when the database refuses it at the commit', async () => {
      mockUpstream({
        workplaces: (init) =>
          init?.method === 'PATCH' ? databaseError('WPL01', 400) : Response.json([pointOfWork]),
        employees: () => new Response(null, { headers: { 'Content-Range': '*/0' } }),
      });
      const response = await request(item, 'PUT', noActivity);
      expect(response.status).toBe(409);
      expect((await reasonOf(response)).reason).toBe('office_needs_workplace');
    });

    it('keeps the last point of work from being archived', async () => {
      mockUpstream({
        workplaces: (init) =>
          init?.method === 'PATCH'
            ? Response.json({ id: pointOfWork.id })
            : Response.json([
                { id: workplaceRow.id, is_registered_office: true, office_has_activity: false },
                { id: pointOfWork.id, is_registered_office: false, office_has_activity: true },
              ]),
      });
      const response = await request(`${path}/${pointOfWork.id}`, 'DELETE');
      expect(response.status).toBe(409);
      expect((await reasonOf(response)).reason).toBe('office_needs_workplace');
      expect(
        callsTo('/rest/v1/client_workplaces').filter((call) => call.method === 'PATCH')
      ).toEqual([]);
      expect((await request(item, 'DELETE')).status).toBe(204);
    });
  });

  it('answers 404 for a workplace that is not there', async () => {
    mockUpstream({
      workplaces: (init) => (init?.method === 'PATCH' ? Response.json(null) : Response.json([])),
    });
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
      currentEmployee: true,
      portal: 'invited',
      workplaceId: null,
    });
    const portal = callsTo('/rest/v1/employee_list')[0]!.url.searchParams;
    expect(portal.get('id')).toBe(`in.(${employeeId})`);
    expect(portal.get('client_id')).toBe(`eq.${clientId}`);
    const { url } = callsTo('/rest/v1/client_responsible_persons')[0]!;
    expect(url.searchParams.get('select')).toContain('employees(job_title,status,archived_at)');
    expect(url.searchParams.get('order')).toBe('full_name.asc,id.asc');
  });

  it('says whether the linked employee still works for the client', async () => {
    const departed = {
      ...responsiblePersonRow,
      employees: { job_title: 'Director magazin', status: 'terminated', archived_at: null },
    };
    const archived = {
      ...responsiblePersonRow,
      employees: {
        job_title: 'Director magazin',
        status: 'active',
        archived_at: '2026-10-01T10:00:00+00:00',
      },
    };
    const outsider = { ...responsiblePersonRow, employee_id: null, employees: null };
    mockUpstream({ responsiblePersons: () => Response.json([departed, archived, outsider]) });
    const { items } = responsiblePersonListResponseSchema.parse(await (await request(path)).json());
    expect(items.map((item) => item.currentEmployee)).toEqual([false, false, false]);
    expect(items.map((item) => item.portal)).toEqual(['invited', 'invited', null]);
  });

  it('creates one, with or without an employee', async () => {
    mockUpstream({
      responsiblePersons: () => Response.json(responsiblePersonRow, { status: 201 }),
    });
    const response = await request(path, 'POST', { ...body, employeeId: undefined });
    expect(response.status).toBe(201);
    responsiblePersonResponseSchema.parse(await response.json());
    expect(callsTo('/rest/v1/client_responsible_persons')[0]!.body).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      employee_id: null,
      full_name: 'Ion Popescu',
      job_title: 'Manager magazin',
      roles: ['workplace_manager', 'first_aid'],
      workplace_id: null,
      created_by: user.id,
    });
  });

  it('ties a fire-safety role to one active workplace of the client', async () => {
    mockUpstream({
      workplaces: () => Response.json({ id: workplaceRow.id, office_has_activity: true }),
      responsiblePersons: () => Response.json(responsiblePersonRow, { status: 201 }),
    });
    const response = await request(path, 'POST', {
      ...body,
      roles: ['fire_safety_coordinator', 'fire_intervention_leader'],
      workplaceId: workplaceRow.id,
    });
    expect(response.status).toBe(201);
    const [find] = callsTo('/rest/v1/client_workplaces').map(({ url }) => url.searchParams);
    expect(find!.get('id')).toBe(`eq.${workplaceRow.id}`);
    expect(find!.get('client_id')).toBe(`eq.${clientId}`);
    expect(find!.get('archived_at')).toBe('is.null');
    expect(callsTo('/rest/v1/client_responsible_persons')[0]!.body).toMatchObject({
      workplace_id: workplaceRow.id,
      roles: ['fire_safety_coordinator', 'fire_intervention_leader'],
    });
  });

  it('names the workplace field when the workplace is not an active one of this client', async () => {
    mockUpstream({ workplaces: () => Response.json(null) });
    for (const [method, url] of [
      ['POST', path],
      ['PUT', `${path}/${responsiblePersonRow.id}`],
    ] as const) {
      const response = await request(url, method, { ...body, workplaceId: workplaceRow.id });
      expect(response.status).toBe(400);
      expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
        'workplaceId'
      );
    }
    expect(callsTo('/rest/v1/client_responsible_persons')).toHaveLength(0);
  });

  describe('tied to a registered office with no activity (ADR 041)', () => {
    const office = { id: workplaceRow.id, office_has_activity: false };
    const item = `${path}/${responsiblePersonRow.id}`;
    const tied = { ...body, workplaceId: workplaceRow.id };
    const writes = () =>
      callsTo('/rest/v1/client_responsible_persons').filter((call) => call.method !== 'GET');

    it('is refused on a new person and on a new tie, naming the workplace field', async () => {
      mockUpstream({
        workplaces: () => Response.json(office),
        responsiblePersons: (init) =>
          init?.method === 'PATCH'
            ? Response.json(responsiblePersonRow)
            : Response.json({ workplace_id: null }),
      });
      for (const [method, url] of [
        ['POST', path],
        ['PUT', item],
      ] as const) {
        const response = await request(url, method, tied);
        expect(response.status).toBe(400);
        expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
          'workplaceId'
        );
      }
      expect(writes()).toEqual([]);
    });

    it('keeps a tie made before the office was answered "no"', async () => {
      mockUpstream({
        workplaces: () => Response.json(office),
        responsiblePersons: (init) =>
          init?.method === 'PATCH'
            ? Response.json({ ...responsiblePersonRow, workplace_id: workplaceRow.id })
            : Response.json({ workplace_id: workplaceRow.id }),
      });
      expect((await request(item, 'PUT', tied)).status).toBe(200);
      expect(writes()[0]!.body).toMatchObject({
        workplace_id: workplaceRow.id,
      });
    });
  });

  it('refuses no role, an unknown role, and a role given twice', async () => {
    mockUpstream({});
    for (const roles of [[], ['janitor'], ['first_aid', 'first_aid']]) {
      expect((await request(path, 'POST', { ...body, roles })).status).toBe(400);
    }
    expect(callsTo('/rest/v1/client_responsible_persons')).toHaveLength(0);
  });

  it('names the employee field when the employee is of another client', async () => {
    mockUpstream({ responsiblePersons: () => databaseError('23503', 409) });
    const response = await request(path, 'POST', body);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'employeeId'
    );
  });

  it('refuses an archived client with its reason', async () => {
    mockUpstream({ clients: () => Response.json({ ...activeClient, archived_at: '2026-09-01' }) });
    const response = await request(path, 'POST', body);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
    expect(callsTo('/rest/v1/client_responsible_persons')).toHaveLength(0);
  });

  it('passes on the refusal of the database for an archived client on a change', async () => {
    mockUpstream({
      responsiblePersons: (init) =>
        init?.method === 'PATCH'
          ? databaseError('CLA01', 400)
          : Response.json([responsiblePersonRow]),
    });
    const response = await request(`${path}/${responsiblePersonRow.id}`, 'PUT', body);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

  it('answers 409 when the employee already is a responsible person', async () => {
    mockUpstream({ responsiblePersons: () => databaseError('23505', 409) });
    expect((await request(path, 'POST', body)).status).toBe(409);
    expect((await request(`${path}/${responsiblePersonRow.id}`, 'PUT', body)).status).toBe(409);
  });

  describe("as the workers' representative", () => {
    const representative = { ...body, roles: ['workers_representative'] };
    const withLegalRepresentative = (name: string) =>
      mockUpstream({
        clients: () => Response.json({ ...activeClient, legal_representative_name: name }),
        responsiblePersons: () => Response.json(responsiblePersonRow, { status: 201 }),
      });

    it('refuses someone who is not an employee', async () => {
      mockUpstream({});
      const response = await request(path, 'POST', { ...representative, employeeId: null });
      expect(response.status).toBe(400);
      expect(callsTo('/rest/v1/client_responsible_persons')).toHaveLength(0);
    });

    it("refuses the client's legal representative, however the name is typed", async () => {
      withLegalRepresentative('POPESCU Ion');
      for (const [method, url] of [
        ['POST', path],
        ['PUT', `${path}/${responsiblePersonRow.id}`],
      ] as const) {
        const response = await request(url, method, representative);
        expect(response.status).toBe(409);
        expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
          'workers_representative_is_legal_representative'
        );
      }
      expect(callsTo('/rest/v1/client_responsible_persons')).toHaveLength(0);
    });

    it('takes another employee', async () => {
      withLegalRepresentative('Maria Popescu');
      expect((await request(path, 'POST', representative)).status).toBe(201);
    });
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
