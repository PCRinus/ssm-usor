import {
  apiErrorResponseSchema,
  contractReturnResponseSchema,
  documentDownloadResponseSchema,
  type MailService,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { hashToken } from '../../lib/tokens';

const sendSignedCopyReceived = vi.fn<MailService['sendSignedCopyReceived']>();
const mail = { sendSignedCopyReceived } as unknown as MailService;

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_0000',
  APP_ORIGIN: 'https://app.ssmusor.ro',
  MAIL: mail,
};

const token = 'a-token-of-a-reasonable-length-1234567890';
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const documentId = 'c2a5b1d0-2b7e-4d3f-9a1c-5e6f7a8b9c0d';
const revisionId = 'e7d6c5b4-a3f2-4e1d-8c9b-0a1b2c3d4e5f';
const ownerId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const docxPath = `${organizationId}/${clientId}/${documentId}/1.docx`;

const sendRow = {
  id: 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b',
  document_id: documentId,
  revision_id: revisionId,
  organization_id: organizationId,
  sent_by: ownerId,
  return_expires_at: '2099-01-01T00:00:00+00:00',
  return_uploads: 0,
};
const revisionRow = {
  id: revisionId,
  revision: 1,
  status: 'issued',
  docx_path: docxPath,
  pdf_path: docxPath.replace(/\.docx$/, '.pdf'),
  document_signed_copies: null as null | Record<string, unknown>,
};

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;
type Upstream = 'sends' | 'revision' | 'copies' | 'upload' | 'sign';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.startsWith('/storage/v1/object/sign/documents/')) {
      return (
        handlers.sign?.(init, url) ??
        Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` })
      );
    }
    if (url.pathname.startsWith('/storage/v1/object/documents')) {
      return handlers.upload?.(init, url) ?? Response.json({ Key: 'documents/x' });
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      return Response.json({ id: ownerId, email: 'olga@safety.example' });
    }
    switch (url.pathname) {
      case '/rest/v1/service_contract_sends':
        return (
          handlers.sends?.(init, url) ??
          (method === 'PATCH' ? new Response(null, { status: 204 }) : Response.json(sendRow))
        );
      case '/rest/v1/document_revisions':
        return handlers.revision?.(init, url) ?? Response.json(revisionRow);
      case '/rest/v1/client_documents':
        return Response.json({ id: documentId, client_id: clientId, title: 'Contract' });
      case '/rest/v1/organizations':
        return Response.json({ name: 'Safety', legal_name: 'S.C. SAFETY S.R.L.' });
      case '/rest/v1/clients':
        return Response.json({
          id: clientId,
          legal_name: 'S.C. VELOCITA URBANA S.R.L.',
          archived_at: null,
        });
      case '/rest/v1/service_contracts':
        return Response.json({ contract_number: 51, contract_date: '2026-02-15' });
      case '/rest/v1/document_signed_copies':
        return handlers.copies?.(init, url) ?? new Response(null, { status: 201 });
      default:
        throw new Error(`Unexpected upstream request: ${method} ${url}`);
    }
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname.startsWith(pathname) && (init?.method ?? 'GET') === method
  );

const post = (path: string, body: unknown) =>
  createApp().request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env
  );

const pdf = new Uint8Array([...new TextEncoder().encode('%PDF-1.7 semnat'), 1, 2, 3]);
const upload = (bytes: Uint8Array = pdf, withToken = token) => {
  const form = new FormData();
  form.append('token', withToken);
  form.append(
    'file',
    new File([new Uint8Array(bytes)], 'contract semnat.pdf', { type: 'application/pdf' })
  );
  return createApp().request('/contract-returns/upload', { method: 'POST', body: form }, env);
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  sendSignedCopyReceived.mockResolvedValue({ id: 'msg_1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('the return link', () => {
  it('describes the contract behind a token, by the hash of the token', async () => {
    mockUpstream();
    const response = await post('/contract-returns/lookup', { token });
    expect(response.status).toBe(200);
    expect(contractReturnResponseSchema.parse(await response.json())).toEqual({
      status: 'open',
      organizationName: 'S.C. SAFETY S.R.L.',
      clientName: 'S.C. VELOCITA URBANA S.R.L.',
      contractNumber: 51,
      contractDate: '2026-02-15',
      revision: 1,
      contactEmail: 'olga@safety.example',
      receivedAt: null,
    });
    const [lookup] = calls('/rest/v1/service_contract_sends');
    expect(new URL(String(lookup![0])).searchParams.get('token_hash')).toBe(
      `eq.${await hashToken(token)}`
    );
    expect(String(lookup![0])).not.toContain(token);
  });

  it('is unknown for a token no send has', async () => {
    mockUpstream({ sends: () => Response.json(null) });
    expect((await post('/contract-returns/lookup', { token })).status).toBe(404);
  });

  it('says when the copy is received, confirmed, superseded or the link expired', async () => {
    const statusFor = async (
      copy: Record<string, unknown> | null,
      revision: Partial<typeof revisionRow> = {},
      send: Partial<typeof sendRow> = {}
    ) => {
      mockUpstream({
        revision: () =>
          Response.json({ ...revisionRow, ...revision, document_signed_copies: copy }),
        sends: (init) =>
          init?.method === 'PATCH'
            ? new Response(null, { status: 204 })
            : Response.json({ ...sendRow, ...send }),
      });
      const response = await post('/contract-returns/lookup', { token });
      return contractReturnResponseSchema.parse(await response.json());
    };
    const received = {
      source: 'client',
      confirmed_at: null,
      uploaded_at: '2026-09-22T09:00:00+00:00',
    };
    expect(await statusFor(received)).toMatchObject({
      status: 'received',
      receivedAt: '2026-09-22T09:00:00+00:00',
    });
    expect(
      await statusFor({ ...received, confirmed_at: '2026-09-23T09:00:00+00:00' })
    ).toMatchObject({ status: 'confirmed', receivedAt: null });
    expect(await statusFor(null, { status: 'superseded' })).toMatchObject({ status: 'superseded' });
    expect(
      await statusFor(null, {}, { return_expires_at: '2020-01-01T00:00:00+00:00' })
    ).toMatchObject({ status: 'expired' });
  });

  it('links to the PDF that was sent while the link is open', async () => {
    mockUpstream();
    const response = await post('/contract-returns/download', { token });
    expect(response.status).toBe(200);
    const link = documentDownloadResponseSchema.parse(await response.json());
    expect(link.fileName).toBe('Contract nr. 51 din 15.02.2026.pdf');
    expect(link.url).toContain(`/object/sign/documents/${revisionRow.pdf_path}`);
  });

  it('refuses the PDF and the upload once a copy is confirmed', async () => {
    mockUpstream({
      revision: () =>
        Response.json({
          ...revisionRow,
          document_signed_copies: { source: 'owner', confirmed_at: 'x', uploaded_at: 'x' },
        }),
    });
    const download = await post('/contract-returns/download', { token });
    expect(download.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await download.json()).reason).toBe('return_link_closed');
    const uploaded = await upload();
    expect(uploaded.status).toBe(409);
    expect(calls('/rest/v1/document_signed_copies', 'POST')).toHaveLength(0);
    expect(calls('/storage/v1/object/documents', 'POST')).toHaveLength(0);
  });

  it('keeps what comes back as a received copy, stores the file, and tells the owner', async () => {
    mockUpstream();
    const response = await upload();
    expect(response.status).toBe(200);
    expect(contractReturnResponseSchema.parse(await response.json())).toMatchObject({
      status: 'received',
      receivedAt: expect.any(String),
    });

    const [recorded] = calls('/rest/v1/document_signed_copies', 'POST');
    expect(JSON.parse(String(recorded![1]?.body))).toMatchObject({
      revision_id: revisionId,
      organization_id: organizationId,
      document_id: documentId,
      storage_path: docxPath.replace(/\.docx$/, '.signed.pdf'),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      uploaded_by: null,
      source: 'client',
      confirmed_at: null,
    });
    const [counted] = calls('/rest/v1/service_contract_sends', 'PATCH');
    expect(JSON.parse(String(counted![1]?.body))).toEqual({ return_uploads: 1 });
    const [stored] = calls('/storage/v1/object/documents/', 'POST');
    expect(String(stored![0])).toContain('/1.signed.pdf');
    expect(new Uint8Array(await new Response(stored![1]?.body).arrayBuffer())).toEqual(pdf);
    expect(sendSignedCopyReceived).toHaveBeenCalledWith({
      to: 'olga@safety.example',
      clientName: 'S.C. VELOCITA URBANA S.R.L.',
      contractNumber: 51,
      contractDate: '2026-02-15',
      leadUrl: `https://app.ssmusor.ro/leads/${clientId}`,
    });
  });

  it('takes only a PDF, and only so many times', async () => {
    mockUpstream();
    const notPdf = await upload(new TextEncoder().encode('hello'));
    expect(notPdf.status).toBe(400);
    expect(calls('/rest/v1/document_signed_copies', 'POST')).toHaveLength(0);

    mockUpstream({
      sends: (init) =>
        init?.method === 'PATCH'
          ? new Response(null, { status: 204 })
          : Response.json({ ...sendRow, return_uploads: 20 }),
    });
    const tooMany = await upload();
    expect(tooMany.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await tooMany.json()).reason).toBe(
      'return_link_too_many_uploads'
    );
  });
});
