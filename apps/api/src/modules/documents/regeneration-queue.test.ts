import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';

// The regeneration itself is the single-document path, tested with the routes; here it only
// says whether it succeeded.
vi.mock('./documents', () => ({ regenerateDocument: vi.fn() }));

import { regenerateDocument } from './documents';
import { consumeRegenerationBatch, lastDelivery, type QueueMessage } from './regeneration-queue';

const regenerate = vi.mocked(regenerateDocument);

const secretKey = 'sb_secret_test_key_regeneration';
const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
};

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const requesterId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const jobId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const clientId = 'c0000000-0000-4000-8000-000000000001';
const documentId = 'd0000000-0000-4000-8000-000000000001';

const itemRow = (status = 'queued', requestedBy: string | null = requesterId) => ({
  status,
  regeneration_jobs: {
    organization_id: organizationId,
    type_key: 'decision_training',
    requested_by: requestedBy,
  },
});

type Handler = () => Response;
const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<'item' | 'behind' | 'record', Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case '/rest/v1/regeneration_job_items':
        return handlers.item?.() ?? Response.json(itemRow());
      case '/rest/v1/documents_behind':
        return (
          handlers.behind?.() ?? Response.json({ document_id: documentId, edited_draft: false })
        );
      case '/rest/v1/rpc/record_regeneration_item':
        return handlers.record?.() ?? Response.json(true);
      default:
        throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
    }
  });
}

const message = (attempts = 1, body: unknown = { jobId, clientId }) => {
  const sent = { body, attempts, ack: vi.fn(), retry: vi.fn() } satisfies QueueMessage;
  return sent;
};

const records = () =>
  fetchMock.mock.calls
    .filter(
      ([input]) => new URL(String(input)).pathname === '/rest/v1/rpc/record_regeneration_item'
    )
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  regenerate.mockReset();
  regenerate.mockResolvedValue({} as Awaited<ReturnType<typeof regenerateDocument>>);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the regeneration queue consumer', () => {
  it('regenerates the document behind as the member who asked, with the secret key', async () => {
    mockUpstream();
    const delivered = message();
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(regenerate).toHaveBeenCalledOnce();
    const [, , actor, regenerated, request] = regenerate.mock.calls[0]!;
    expect(actor).toEqual({ userId: requesterId, organizationId, createdBy: requesterId });
    expect(regenerated).toBe(documentId);
    expect(request).toEqual({});
    expect(records()).toEqual([
      { p_job_id: jobId, p_client_id: clientId, p_status: 'done', p_detail: null },
    ]);
    expect(delivered.ack).toHaveBeenCalledOnce();
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secretKey}`);
    }
    const behind = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === '/rest/v1/documents_behind')!;
    expect(behind.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(behind.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(behind.searchParams.get('type_key')).toBe('eq.decision_training');
  });

  it('skips a draft edited by hand, saying why', async () => {
    mockUpstream({ behind: () => Response.json({ document_id: documentId, edited_draft: true }) });
    const delivered = message();
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(regenerate).not.toHaveBeenCalled();
    expect(records()).toEqual([
      {
        p_job_id: jobId,
        p_client_id: clientId,
        p_status: 'skipped',
        p_detail:
          'Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde. Regenerează documentul din pagina clientului.',
      },
    ]);
    expect(delivered.ack).toHaveBeenCalledOnce();
  });

  it('leaves a client already recorded as it is when the message comes again', async () => {
    mockUpstream({ item: () => Response.json(itemRow('done')) });
    const delivered = message(2);
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(regenerate).not.toHaveBeenCalled();
    expect(records()).toEqual([]);
    expect(delivered.ack).toHaveBeenCalledOnce();
  });

  it('skips a document that is no longer behind', async () => {
    mockUpstream({ behind: () => Response.json([]) });
    await consumeRegenerationBatch({ messages: [message()] }, env);

    expect(regenerate).not.toHaveBeenCalled();
    expect(records()).toMatchObject([
      { p_status: 'skipped', p_detail: 'Documentul nu mai este în urmă.' },
    ]);
  });

  it('drops the message of a job that was taken back', async () => {
    mockUpstream({ item: () => Response.json([]) });
    const delivered = message();
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(regenerate).not.toHaveBeenCalled();
    expect(records()).toEqual([]);
    expect(delivered.ack).toHaveBeenCalledOnce();
  });

  it('fails a client whose requester has no account any more', async () => {
    mockUpstream({ item: () => Response.json(itemRow('queued', null)) });
    await consumeRegenerationBatch({ messages: [message()] }, env);

    expect(regenerate).not.toHaveBeenCalled();
    expect(records()).toMatchObject([
      { p_status: 'failed', p_detail: 'Membrul care a pornit regenerarea nu mai are cont.' },
    ]);
  });

  it('fails a client whose data is missing at once, keeping what is missing, since another delivery would not help', async () => {
    mockUpstream();
    regenerate.mockRejectedValueOnce(
      new ApiError(
        'conflict',
        'Data the documents print is missing.',
        undefined,
        'missing_document_data',
        ['client.trainingSchedule', 'responsible.workplace_manager']
      )
    );
    const delivered = message();
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(records()).toEqual([
      {
        p_job_id: jobId,
        p_client_id: clientId,
        p_status: 'failed',
        p_detail:
          'Lipsesc date de care documentul are nevoie. Completează-le pe pagina clientului, apoi regenerează documentul.',
        p_missing: ['client.trainingSchedule', 'responsible.workplace_manager'],
      },
    ]);
    expect(delivered.ack).toHaveBeenCalledOnce();
    expect(delivered.retry).not.toHaveBeenCalled();
  });

  it('retries what an unreachable service failed, and fails it on the last delivery', async () => {
    mockUpstream();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    regenerate.mockRejectedValue(new ApiError('service_unavailable'));

    const first = message(1);
    await consumeRegenerationBatch({ messages: [first] }, env);
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(first.ack).not.toHaveBeenCalled();
    expect(records()).toEqual([]);

    const last = message(lastDelivery);
    await consumeRegenerationBatch({ messages: [last] }, env);
    expect(records()).toMatchObject([
      {
        p_status: 'failed',
        p_detail: 'Un serviciu nu a răspuns. Regenerează documentul din pagina clientului.',
      },
    ]);
    expect(last.ack).toHaveBeenCalledOnce();
  });

  it('retries when the outcome cannot be recorded', async () => {
    mockUpstream({ record: () => Response.json({ message: 'down' }, { status: 503 }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const delivered = message();
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(delivered.retry).toHaveBeenCalledOnce();
    expect(delivered.ack).not.toHaveBeenCalled();
  });

  it('drops a message without a job and a client', async () => {
    mockUpstream();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const delivered = message(1, { jobId: 'nope' });
    await consumeRegenerationBatch({ messages: [delivered] }, env);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(delivered.ack).toHaveBeenCalledOnce();
  });

  it('goes on with the next message after one fails', async () => {
    mockUpstream();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    regenerate.mockRejectedValueOnce(new TypeError('fetch failed'));
    const [first, second] = [message(1), message(1)];
    await consumeRegenerationBatch({ messages: [first, second] }, env);

    expect(first.retry).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
    expect(records()).toMatchObject([{ p_status: 'done' }]);
  });
});
