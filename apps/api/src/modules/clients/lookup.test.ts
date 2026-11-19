import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../../database.types';
import { ApiError } from '../../lib/errors';
import { callsTo, mockUpstream, stubFetch } from '../../test/upstream';
import { requireClient, requireWritableClient } from './lookup';

stubFetch();

const clientId = '7f9d2c4e-3a1b-4c8d-9e2f-1a3b5c7d9e0f';
const db = () => createClient<Database>('https://example.supabase.co', 'sb_publishable_test');
const answering = (row: Record<string, unknown> | null) =>
  mockUpstream({ '/rest/v1/clients': () => Response.json(row) });
const refusal = (run: Promise<unknown>) =>
  run.then(
    () => {
      throw new Error('Expected a refusal');
    },
    (error: unknown) => {
      if (!(error instanceof ApiError)) throw error;
      return { code: error.code, message: error.message, reason: error.reason };
    }
  );

const active = { id: clientId, stage: 'client', archived_at: null };

describe('requireClient', () => {
  it('reads the client by its id', async () => {
    answering(active);
    expect(await requireClient(db(), clientId)).toEqual(active);
    expect(callsTo('/rest/v1/clients')[0]?.url.searchParams.get('id')).toBe(`eq.${clientId}`);
  });

  it('answers not found for a client the caller does not reach, archived or not', async () => {
    answering(null);
    expect(await refusal(requireClient(db(), clientId))).toEqual({
      code: 'not_found',
      message: 'This client does not exist in your organization.',
      reason: undefined,
    });
  });
});

describe('requireWritableClient', () => {
  it('refuses an archived client with its reason', async () => {
    answering({ ...active, archived_at: '2026-09-01T00:00:00+00:00' });
    expect(await refusal(requireWritableClient(db(), clientId))).toMatchObject({
      code: 'conflict',
      reason: 'client_archived',
    });
  });

  it('lets a lead through unless asked to refuse it', async () => {
    const lead = { ...active, stage: 'lead' };
    answering(lead);
    expect(await requireWritableClient(db(), clientId)).toEqual(lead);
    expect(await refusal(requireWritableClient(db(), clientId, { lead: 'refused' }))).toMatchObject(
      { code: 'conflict', reason: 'client_is_lead' }
    );
  });
});
