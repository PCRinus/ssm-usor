import { readFileSync } from 'node:fs';

import {
  apiErrorResponseSchema,
  missingSheetDataResponseSchema,
  trainingSheetsResponseSchema,
} from '@ssm-usor/contracts';
import { documentText } from '@ssm-usor/document-engine';
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

const membership = {
  user_id: user.id,
  organization_id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10',
  role: 'owner',
};

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const workshop = {
  id: 'b1b1b1b1-0000-4000-8000-000000000001',
  name: 'Punct de lucru Str. Fabricii 3',
};
const office = { id: 'b1b1b1b1-0000-4000-8000-000000000002', name: 'Sediul social' };

const employeeRow = {
  last_name: 'Popescu',
  first_name: 'Ion',
  employee_number: '0042',
  job_title: 'Sudor',
  home_address: 'Str. Lungă 12, Timișoara',
  birth_date: '1988-03-14',
  birth_place: 'Lugoj',
  blood_group: 'A(II)',
  rh_factor: '+',
  qualification: null,
  education: null,
  authorizations: null,
  commute_route: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
  commute_minutes: 25,
  job_positions: { name: 'Sudor', work_zone: 'Atelier' },
  client_workplaces: workshop,
};

const training = (phase: string, heldOn: string) => ({
  id: `c1c1c1c1-0000-4000-8000-0000000000${heldOn.slice(8)}`,
  client_id: clientId,
  domain: 'ssm',
  phase,
  held_on: heldOn,
  duration_minutes: 120,
  material: `I.P.S.S.M. Art. 1 – 60 (${phase})`,
  trainer_name: 'Ion POP',
  trainer_job_title: 'Șef atelier',
  verifier_name: 'Dan MARIN',
  verifier_job_title: 'Inspector SSM',
  supplementary_reason: null,
  source: 'app',
  themes_revision_id: null,
  notes: null,
  created_at: `${heldOn}T10:00:00+00:00`,
  updated_at: `${heldOn}T10:00:00+00:00`,
});

const recordRows = [
  {
    occupation: 'Sudor',
    admitted_on: '2026-01-06',
    admitted_by_name: 'Ion POP',
    admitted_by_job_title: 'Șef atelier',
    trainings: training('workplace', '2026-01-06'),
  },
  {
    occupation: 'Sudor',
    admitted_on: null,
    admitted_by_name: null,
    admitted_by_job_title: null,
    trainings: training('periodic', '2026-04-03'),
  },
];

const templatesUrl = new URL('../../../../../packages/document-engine/templates/', import.meta.url);
const templateFiles: Record<string, string> = {
  training_sheet_ssm: 'fisa_instruire_ssm.docx',
  training_sheet_psi: 'fire/fisa_instructaj_psi.docx',
};

type Handler = (url: URL) => Response | Promise<Response>;
type Upstream = 'employees' | 'clients' | 'workplaces' | 'records' | 'templates' | 'sheets';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  const defaults: Record<Upstream, Handler> = {
    employees: () => Response.json([employeeRow]),
    clients: () => Response.json([{ legal_name: 'S.C. CLIENT DEMO S.R.L.' }]),
    workplaces: () => Response.json([workshop, office]),
    records: () => Response.json(recordRows),
    sheets: () => Response.json([]),
    templates: (url) => {
      const typeKey = url.searchParams.get('type_key')!.replace(/^in\.\((.*)\)$/, '$1');
      return Response.json([
        {
          type_key: typeKey,
          title: 'Fișa',
          document_template_versions: [
            { id: 'v1', version: 1, storage_path: `built-in/${typeKey}/old.docx` },
            { id: 'v2', version: 2, storage_path: `built-in/${typeKey}/new.docx` },
          ],
        },
      ]);
    },
  };
  const paths: Record<string, Upstream> = {
    '/rest/v1/employees': 'employees',
    '/rest/v1/clients': 'clients',
    '/rest/v1/client_workplaces': 'workplaces',
    '/rest/v1/training_records': 'records',
    '/rest/v1/document_templates': 'templates',
    '/rest/v1/signed_sheets': 'sheets',
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname.startsWith('/storage/v1/object/sign/documents/')) {
      if ((init?.method ?? 'GET') === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      return new Response(`%PDF-1.7 ${url.pathname.split('/').at(-2)}`);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/document-templates/')) {
      if ((init?.method ?? 'GET') === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      const typeKey = url.pathname.split('/').at(-2)!;
      return new Response(readFileSync(new URL(templateFiles[typeKey]!, templatesUrl)));
    }
    const upstream = paths[url.pathname];
    if (!upstream) throw new Error(`Unexpected upstream request: ${url}`);
    return (handlers[upstream] ?? defaults[upstream])(url);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const pdfBytes = new TextEncoder().encode('%PDF-1.7 sheet');
const convertDocx = vi.fn<(docx: ArrayBuffer) => Promise<ArrayBuffer>>(
  async () => pdfBytes.slice().buffer
);
const mergePdfs = vi.fn<(files: ArrayBuffer[]) => Promise<ArrayBuffer>>(
  async () => new TextEncoder().encode('%PDF-1.7 merged').buffer as ArrayBuffer
);
const withConverter = {
  ...env,
  PDF_CONVERSION: 'service',
  PDF: {
    convertDocx,
    convertDocuments: (files: ArrayBuffer[]) => convertDocx(files[0]!),
    convertForm: convertDocx,
    mergePdfs,
  },
} as ApiEnv['Bindings'];

const request = (path: string, bindings: ApiEnv['Bindings'] = withConverter) =>
  createApp().request(path, { headers: { Authorization: 'Bearer test-access-token' } }, bindings);

const sheetsPath = `/clients/${clientId}/employees/${employeeId}/training-sheets`;
const sheetPath = (domain: string) =>
  `/clients/${clientId}/employees/${employeeId}/training-sheet?domain=${domain}`;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  convertDocx.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/employees/{employeeId}/training-sheets', () => {
  it('answers that both sheets are ready for an employee with a route and a workplace', async () => {
    mockUpstream();
    const response = await request(sheetsPath);
    expect(response.status).toBe(200);
    expect(trainingSheetsResponseSchema.parse(await response.json())).toEqual({
      ssm: { ready: true, missing: [], stored: false, sequences: [] },
      psi: { ready: true, missing: [], stored: false, sequences: [] },
    });
    expect(calls('/rest/v1/training_records')).toHaveLength(0);
    const query = new URL(String(calls('/rest/v1/employees')[0]![0])).searchParams;
    expect(query.get('id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    const workplaces = new URL(String(calls('/rest/v1/client_workplaces')[0]![0])).searchParams;
    expect(workplaces.get('archived_at')).toBe('is.null');
  });

  it('names the route on the occupational safety sheet, and the workplace on both at a client with several', async () => {
    mockUpstream({
      employees: () =>
        Response.json([{ ...employeeRow, commute_route: null, client_workplaces: null }]),
    });
    const response = await request(sheetsPath);
    expect(trainingSheetsResponseSchema.parse(await response.json())).toEqual({
      ssm: {
        ready: false,
        missing: ['employee.commute_route', 'employee.workplace'],
        stored: false,
        sequences: [],
      },
      psi: { ready: false, missing: ['employee.workplace'], stored: false, sequences: [] },
    });
  });

  it('needs no workplace from an employee of a client with a single one', async () => {
    mockUpstream({
      employees: () => Response.json([{ ...employeeRow, client_workplaces: null }]),
      workplaces: () => Response.json([workshop]),
    });
    const body = trainingSheetsResponseSchema.parse(await (await request(sheetsPath)).json());
    expect(body.ssm).toEqual({ ready: true, missing: [], stored: false, sequences: [] });
  });

  it('answers a stored signed sheet as ready, whatever the employee now lacks', async () => {
    mockUpstream({
      employees: () => Response.json([{ ...employeeRow, commute_route: null }]),
      sheets: () =>
        Response.json([
          { domain: 'psi', sequence: 1 },
          { domain: 'psi', sequence: 2 },
        ]),
    });
    const body = trainingSheetsResponseSchema.parse(await (await request(sheetsPath)).json());
    expect(body).toEqual({
      ssm: { ready: false, missing: ['employee.commute_route'], stored: false, sequences: [] },
      psi: { ready: true, missing: [], stored: true, sequences: [1, 2] },
    });
    const query = new URL(String(calls('/rest/v1/signed_sheets')[0]![0])).searchParams;
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 404 for an employee who is not of the client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    const response = await request(sheetsPath);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });
});

describe('GET /clients/{clientId}/employees/{employeeId}/training-sheet', () => {
  it('merges the newest template with the employee and their records, converts it and names the file', async () => {
    mockUpstream();
    const response = await request(sheetPath('ssm'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain(
      'attachment; filename="Fisa-SSM-Popescu-Ion.pdf"'
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);

    const records = new URL(String(calls('/rest/v1/training_records')[0]![0])).searchParams;
    expect(records.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(records.get('trainings.domain')).toBe('eq.ssm');
    const templates = new URL(String(calls('/rest/v1/document_templates')[0]![0])).searchParams;
    expect(templates.get('type_key')).toBe('in.(training_sheet_ssm)');
    const signed = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)).pathname)
      .filter((pathname) => pathname.startsWith('/storage/v1/object/sign/'));
    expect(signed[0]).toBe(
      '/storage/v1/object/sign/document-templates/built-in/training_sheet_ssm/new.docx'
    );

    expect(convertDocx).toHaveBeenCalledOnce();
    const text = documentText(new Uint8Array(convertDocx.mock.calls[0]![0]));
    expect(text).toContain('POPESCU Ion');
    expect(text).toContain('Punct de lucru Str. Fabricii 3 – Atelier');
    expect(text).toContain('I.P.S.S.M. Art. 1 – 60 (periodic)');
    expect(text).toContain('Str. Lungă – Str. Fabricii, cu autobuzul 33 (25 de minute)');
  });

  const storedSheet = (sequence: number) => ({
    id: `5d5d5d5d-0000-4000-8000-00000000000${sequence}`,
    organization_id: membership.organization_id,
    client_id: clientId,
    employee_id: employeeId,
    domain: 'ssm',
    sequence,
    storage_path: `signed-sheets/${clientId}/${employeeId}/ssm-${sequence}/v2-abcdef12.pdf`,
    digest: 'd'.repeat(64),
    version: 2,
    row_capacity: 17,
    rows_used: 17,
    certified_at: '2026-10-18T09:30:00+00:00',
    created_at: '2026-10-18T09:00:00+00:00',
  });
  const withSecretKey = { ...withConverter, SUPABASE_SECRET_KEY: 'sb_secret_test_key_value' };
  const stampPages = vi.fn<(pdf: ArrayBuffer, text: string) => Promise<ArrayBuffer>>(
    async (pdf) =>
      new TextEncoder().encode(`${new TextDecoder().decode(pdf)}|stamped`).buffer as ArrayBuffer
  );
  const withSigner = {
    ...withSecretKey,
    SIGNER: { stampPages } as unknown as ApiEnv['Bindings']['SIGNER'],
  } as ApiEnv['Bindings'];

  it('answers the stored signed sheet once signing has started, drawing nothing', async () => {
    mockUpstream({ sheets: () => Response.json([storedSheet(1)]) });
    const response = await request(sheetPath('ssm'), withSecretKey);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('Fisa-SSM-Popescu-Ion.pdf');
    expect(await response.text()).toBe('%PDF-1.7 ssm-1');
    const query = new URL(String(calls('/rest/v1/signed_sheets')[0]![0])).searchParams;
    expect(query.get('domain')).toBe('eq.ssm');
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(calls('/rest/v1/document_templates')).toHaveLength(0);
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('merges a sheet and its continuation into a copy stamped on every page as one to read', async () => {
    mockUpstream({ sheets: () => Response.json([storedSheet(1), storedSheet(2)]) });
    mergePdfs.mockClear();
    const response = await request(sheetPath('ssm'), withSigner);
    expect(await response.text()).toBe('%PDF-1.7 merged|stamped');
    expect(response.headers.get('Content-Disposition')).toContain('Fisa-SSM-Popescu-Ion-copie.pdf');
    const merged = mergePdfs.mock.calls[0]![0].map((file) => new TextDecoder().decode(file));
    expect(merged).toEqual(['%PDF-1.7 ssm-1', '%PDF-1.7 ssm-2']);
    expect(stampPages.mock.calls[0]![1]).toBe(
      'Copie de citire – semnăturile se verifică pe fișele originale'
    );
  });

  it('serves one sheet of several as signed, by its number', async () => {
    mockUpstream({ sheets: () => Response.json([storedSheet(1), storedSheet(2)]) });
    const response = await request(`${sheetPath('ssm')}&sequence=2`, withSigner);
    expect(await response.text()).toBe('%PDF-1.7 ssm-2');
    expect(response.headers.get('Content-Disposition')).toContain('Fisa-SSM-Popescu-Ion-2.pdf');
    expect(stampPages).not.toHaveBeenCalled();

    const missing = await request(`${sheetPath('ssm')}&sequence=3`, withSigner);
    expect(missing.status).toBe(404);
  });

  it('merges the fire-safety template for the PSI sheet', async () => {
    mockUpstream({ employees: () => Response.json([{ ...employeeRow, commute_route: null }]) });
    const response = await request(sheetPath('psi'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(
      'filename="Fisa-PSI-Popescu-Ion.pdf"'
    );
    const text = documentText(new Uint8Array(convertDocx.mock.calls[0]![0]));
    expect(text).toContain('de instructaj în domeniul situațiilor de urgență');
  });

  it('refuses with the missing codes, before converting anything', async () => {
    mockUpstream({ employees: () => Response.json([{ ...employeeRow, commute_route: '' }]) });
    const response = await request(sheetPath('ssm'));
    expect(response.status).toBe(409);
    expect(missingSheetDataResponseSchema.parse(await response.json())).toMatchObject({
      reason: 'missing_sheet_data',
      missing: ['employee.commute_route'],
    });
    expect(calls('/rest/v1/document_templates')).toHaveLength(0);
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('answers 503 pdf_unavailable without a converter', async () => {
    mockUpstream();
    const response = await request(sheetPath('ssm'), env);
    expect(response.status).toBe(503);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('pdf_unavailable');
    expect(calls('/rest/v1/document_templates')).toHaveLength(0);
  });

  it('answers 503 template_missing while the template is not registered', async () => {
    mockUpstream({ templates: () => Response.json([]) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(sheetPath('ssm'));
    expect(response.status).toBe(503);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('template_missing');
  });

  it('answers 404 for an employee who is not of the client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    expect((await request(sheetPath('ssm'))).status).toBe(404);
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('rejects a domain it does not know', async () => {
    mockUpstream();
    expect((await request(sheetPath('fire'))).status).toBe(400);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });
});
