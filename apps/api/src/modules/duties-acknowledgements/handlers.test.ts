import { readFileSync } from 'node:fs';

import { apiErrorResponseSchema, dutiesAcknowledgementResponseSchema } from '@ssm-usor/contracts';
import { documentText } from '@ssm-usor/document-engine';
import { templatesUrl } from '@ssm-usor/document-engine/template-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '../../lib/env';
import { romanianDay } from '../../lib/romanian';
import { apiRequest } from '../../test/request';
import {
  callsTo,
  databaseError,
  mockUpstream,
  stubFetch,
  testEnv,
  testOrganizationId,
  testUser,
  type UpstreamRoutes,
} from '../../test/upstream';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const positionId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const documentId = 'd1d1d1d1-0000-4000-8000-000000000001';
const revisionId = 'd2d2d2d2-0000-4000-8000-000000000002';
const olderRevisionId = 'd2d2d2d2-0000-4000-8000-000000000001';
const recordId = 'e0e0e0e0-0000-4000-8000-000000000001';
const fileId = 'f0f0f0f0-0000-4000-8000-000000000001';
const basePath = `/clients/${clientId}/employees/${employeeId}/duties-acknowledgement`;

const env = testEnv();
const convertDocx = vi.fn<(docx: ArrayBuffer) => Promise<ArrayBuffer>>(
  async () => new TextEncoder().encode('%PDF-1.7 sheet').buffer
);
const withConverter = {
  ...env,
  PDF_CONVERSION: 'service',
  PDF: {
    convertDocx,
    convertDocuments: (files: ArrayBuffer[]) => convertDocx(files[0]!),
    convertForm: convertDocx,
    mergePdfs: (files: ArrayBuffer[]) => convertDocx(files[0]!),
  },
} as ApiEnv['Bindings'];

const employeeRow = {
  id: employeeId,
  first_name: 'Ion',
  last_name: 'Popescu',
  job_position_id: positionId,
};

const roles = [
  { role: 'imminent_danger', fingerprint: 'danger' },
  { role: 'workplace_manager', fingerprint: 'manager' },
];

const stateRow = {
  state: 'to_sign',
  document_id: documentId,
  revision_id: revisionId,
  issue_date: '2026-11-24',
  annex_number: 2,
  position_name: 'Sudor',
  annex_fingerprint: 'welder',
  roles,
  annex_changed: false,
  roles_changed: false,
};

const recordRow = {
  id: recordId,
  state: 'signed_on_paper',
  signed_at: '2026-10-05T09:00:00+00:00',
  client_file_id: fileId,
  revision_id: olderRevisionId,
  job_position_id: positionId,
  position_name: 'Sudor',
  annex_number: 1,
  roles: [{ role: 'workplace_manager', fingerprint: 'manager' }],
  recorded_at: '2026-10-05T12:00:00+00:00',
  recorded_by: testUser.id,
  document_revisions: {
    document_id: documentId,
    document_generations: { issue_date: '2026-10-01' },
  },
};

const snapshot = {
  branding: true,
  issueDate: '24.11.2026',
  client: { legalName: 'Fabrica Sigma SRL' },
  dutyAnnexes: [
    {
      number: 2,
      positionId,
      position: 'Sudor',
      instructions: [{ number: 3, title: 'Sudură' }],
      hasInstructions: true,
      equipment: true,
      zones: [],
      hasZones: false,
      trainingInterval: 'la 3 luni',
      workplaceManagerDuties: { people: 'Ion Popescu și Ana Dobre', employeeIds: [employeeId] },
      firstAidDuties: { people: 'Ana Dobre', employeeIds: ['x'] },
      imminentDangerDuties: {
        people: 'Ion Popescu',
        employeeIds: [employeeId],
        decision: 'nr. 4 SSM din 24.11.2026',
      },
      workersRepresentativeDuties: null,
    },
  ],
};

function upstream(overrides: UpstreamRoutes = {}): UpstreamRoutes {
  return {
    '/rest/v1/employees': () => [employeeRow],
    '/rest/v1/employee_duty_acknowledgement_states': () => [stateRow],
    'GET /rest/v1/employee_duty_acknowledgements': () => [],
    '/rest/v1/profiles': () => [{ user_id: testUser.id, full_name: 'Ana Specialist' }],
    ...overrides,
  };
}

const request = (path: string, init: { method?: string; body?: unknown } = {}, bindings = env) =>
  apiRequest(path, init, bindings);

stubFetch();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  convertDocx.mockClear();
});

describe('GET …/duties-acknowledgement', () => {
  it('names the sheet to sign, with the roles the worker holds in it', async () => {
    mockUpstream(upstream());
    const response = await request(basePath);
    expect(response.status).toBe(200);
    expect(dutiesAcknowledgementResponseSchema.parse(await response.json())).toEqual({
      status: 'to_sign',
      reasons: [],
      revision: { documentId, revisionId, issueDate: '2026-11-24' },
      annex: {
        documentId,
        revisionId,
        issueDate: '2026-11-24',
        number: 2,
        position: { id: positionId, name: 'Sudor' },
        roles: ['imminent_danger', 'workplace_manager'],
      },
      current: null,
      history: [],
    });
  });

  it('keeps the earlier records as history, and says why the sheet is to be signed again', async () => {
    const newer = { ...recordRow, id: 'e0e0e0e0-0000-4000-8000-000000000002', recorded_by: null };
    mockUpstream(
      upstream({
        '/rest/v1/employee_duty_acknowledgement_states': () => [
          { ...stateRow, state: 'sign_again', annex_changed: true, roles_changed: true },
        ],
        'GET /rest/v1/employee_duty_acknowledgements': () => [newer, recordRow],
      })
    );
    const body = dutiesAcknowledgementResponseSchema.parse(await (await request(basePath)).json());
    expect(body.reasons).toEqual(['annex_changed', 'roles_changed']);
    expect(body.current).toMatchObject({ id: newer.id, recordedBy: null });
    expect(body.history).toEqual([
      {
        id: recordId,
        state: 'signed_on_paper',
        signedAt: '2026-10-05T09:00:00.000Z',
        signedOn: '2026-10-05',
        clientFileId: fileId,
        annex: {
          documentId,
          revisionId: olderRevisionId,
          issueDate: '2026-10-01',
          number: 1,
          position: { id: positionId, name: 'Sudor' },
          roles: ['workplace_manager'],
        },
        recordedAt: '2026-10-05T12:00:00.000Z',
        recordedBy: { id: testUser.id, fullName: 'Ana Specialist' },
      },
    ]);
    const [records] = callsTo('/rest/v1/employee_duty_acknowledgements');
    expect(records!.url.searchParams.get('order')).toBe('recorded_at.desc,id.desc');
  });

  it('has no sheet without an issued document 13, nor for a post it has no annex for', async () => {
    mockUpstream(
      upstream({
        '/rest/v1/employee_duty_acknowledgement_states': () => [
          {
            ...stateRow,
            state: 'no_annex',
            annex_number: null,
            annex_fingerprint: null,
            roles: [],
          },
        ],
      })
    );
    const noAnnex = dutiesAcknowledgementResponseSchema.parse(
      await (await request(basePath)).json()
    );
    expect(noAnnex).toMatchObject({ status: 'no_annex', annex: null, revision: { revisionId } });

    mockUpstream(
      upstream({
        '/rest/v1/employee_duty_acknowledgement_states': () => [
          {
            ...stateRow,
            state: 'not_issued',
            document_id: null,
            revision_id: null,
            issue_date: null,
            annex_number: null,
            annex_fingerprint: null,
            roles: [],
          },
        ],
      })
    );
    const notIssued = dutiesAcknowledgementResponseSchema.parse(
      await (await request(basePath)).json()
    );
    expect(notIssued).toMatchObject({ status: 'not_issued', annex: null, revision: null });
  });

  it('is not found for an employee of another client', async () => {
    mockUpstream(
      upstream({
        '/rest/v1/employees': () => [],
        '/rest/v1/employee_duty_acknowledgement_states': () => [],
      })
    );
    expect((await request(basePath)).status).toBe(404);
  });
});

describe('POST …/duties-acknowledgement/records', () => {
  const record = (body: Record<string, unknown>) =>
    request(`${basePath}/records`, { method: 'POST', body });

  it('records the sheet signed on paper, with what the revision printed for the worker', async () => {
    mockUpstream(
      upstream({
        'POST /rest/v1/employee_duty_acknowledgements': () => new Response(null, { status: 201 }),
      })
    );
    const response = await record({ revisionId, signedOn: '2026-11-25', clientFileId: fileId });
    expect(response.status).toBe(200);
    dutiesAcknowledgementResponseSchema.parse(await response.json());
    const [insert] = callsTo('/rest/v1/employee_duty_acknowledgements', 'POST');
    expect(insert!.body).toEqual({
      organization_id: testOrganizationId,
      client_id: clientId,
      employee_id: employeeId,
      revision_id: revisionId,
      job_position_id: positionId,
      position_name: 'Sudor',
      annex_number: 2,
      annex_fingerprint: 'welder',
      roles,
      signed_at: '2026-11-25T10:00:00.000Z',
      client_file_id: fileId,
    });
  });

  it('refuses a revision no longer in force, a day in the future or before the issue', async () => {
    mockUpstream(upstream());
    const stale = await record({ revisionId: olderRevisionId, signedOn: '2026-11-25' });
    expect(stale.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await stale.json()).reason).toBe(
      'duties_revision_not_current'
    );
    const tomorrow = romanianDay(new Date(Date.now() + 36 * 3_600_000));
    expect((await record({ revisionId, signedOn: tomorrow })).status).toBe(400);
    expect((await record({ revisionId, signedOn: '2026-11-23' })).status).toBe(400);
    expect((await record({ revisionId })).status).toBe(400);
    expect(callsTo('/rest/v1/employee_duty_acknowledgements', 'POST')).toHaveLength(0);
  });

  it('refuses without a sheet to sign', async () => {
    mockUpstream(
      upstream({
        '/rest/v1/employee_duty_acknowledgement_states': () => [{ ...stateRow, state: 'no_annex' }],
      })
    );
    const response = await record({ revisionId, signedOn: '2026-11-25' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('duties_no_annex');
  });

  it('refuses a scan that is not a file of the client', async () => {
    mockUpstream(
      upstream({
        'POST /rest/v1/employee_duty_acknowledgements': () =>
          databaseError('23503', 'violates foreign key constraint', 409),
      })
    );
    expect(
      (await record({ revisionId, signedOn: '2026-11-25', clientFileId: fileId })).status
    ).toBe(409);
  });
});

describe('DELETE …/duties-acknowledgement/records/{recordId}', () => {
  it('removes a mistaken record of the employee', async () => {
    mockUpstream(
      upstream({ 'DELETE /rest/v1/employee_duty_acknowledgements': () => [{ id: recordId }] })
    );
    const response = await request(`${basePath}/records/${recordId}`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    const [deleted] = callsTo('/rest/v1/employee_duty_acknowledgements', 'DELETE');
    expect(deleted!.url.searchParams.get('id')).toBe(`eq.${recordId}`);
    expect(deleted!.url.searchParams.get('employee_id')).toBe(`eq.${employeeId}`);
  });

  it('is not found for a record of someone else', async () => {
    mockUpstream(upstream({ 'DELETE /rest/v1/employee_duty_acknowledgements': () => [] }));
    const response = await request(`${basePath}/records/${recordId}`, { method: 'DELETE' });
    expect(response.status).toBe(404);
  });
});

describe('the acknowledgement sheet', () => {
  const sheetUpstream = (overrides: UpstreamRoutes = {}) =>
    upstream({
      '/rest/v1/document_revisions': () => [{ data_snapshot: snapshot }],
      '/rest/v1/document_templates': () => [
        {
          type_key: 'duties_acknowledgement',
          title: 'Fișa de luare la cunoștință a atribuțiilor SSM',
          document_template_versions: [
            { id: 'v1', version: 1, storage_path: 'built-in/duties_acknowledgement/v1.docx' },
          ],
        },
      ],
      'POST /storage/v1/object/sign/document-templates/built-in/duties_acknowledgement/v1.docx':
        () => ({
          signedURL: '/object/sign/document-templates/built-in/duties_acknowledgement/v1.docx?t=1',
        }),
      'GET /storage/v1/object/sign/document-templates/built-in/duties_acknowledgement/v1.docx':
        () => new Response(readFileSync(new URL('fisa_atributii_ssm.docx', templatesUrl))),
      ...overrides,
    });

  it("prints the worker's annex as the revision printed it, with only their role blocks and name", async () => {
    mockUpstream(sheetUpstream());
    const response = await request(`${basePath}/sheet/word`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(
      'filename="Fisa-atributii-SSM-Popescu-Ion.docx"'
    );
    const text = documentText(new Uint8Array(await response.arrayBuffer()));
    expect(text).toContain('anexa 2 din documentul 13');
    expect(text).toContain('emis la 24.11.2026');
    expect(text).toContain('Fabrica Sigma');
    expect(text).toContain('Conducător al locului de muncă: Ion Popescu');
    expect(text).not.toContain('Ana Dobre');
    expect(text).toContain('conform deciziei nr. 4 SSM din 24.11.2026: Ion Popescu');
    expect(text).toContain('Am primit, am citit și am înțeles');
    expect(text).not.toContain('{');
  });

  it('converts it to a PDF', async () => {
    mockUpstream(sheetUpstream());
    const response = await request(`${basePath}/sheet`, {}, withConverter);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(documentText(new Uint8Array(convertDocx.mock.calls[0]![0]))).toContain('Ion Popescu');
  });

  it('has none to draw up without an issued document 13', async () => {
    mockUpstream(
      sheetUpstream({
        '/rest/v1/employee_duty_acknowledgement_states': () => [
          { ...stateRow, state: 'not_issued' },
        ],
      })
    );
    const response = await request(`${basePath}/sheet/word`);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('duties_not_issued');
  });
});
