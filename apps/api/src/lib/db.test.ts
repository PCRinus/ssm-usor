import type { Context } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fromDatabaseError, requestFetch } from './db';
import type { ApiEnv } from './env';

afterEach(() => vi.restoreAllMocks());

describe('fromDatabaseError', () => {
  it('logs why a request never reached the database', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: '', message: 'TypeError: fetch failed' },
      'list clients'
    );
    expect(error.code).toBe('service_unavailable');
    expect(logged).toHaveBeenCalledWith(
      'Database request failed (list clients): no code: TypeError: fetch failed'
    );
  });

  it('logs only the code of an error the database raised', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: 'XX000', message: 'failed on row (Ion Popescu)' },
      'save employee'
    );
    expect(error.code).toBe('internal_error');
    expect(logged).toHaveBeenCalledWith('Database request failed (save employee): XX000');
  });

  it('names the constraint a write broke, and its table, never the values', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = [
      {
        code: '23514',
        message:
          'new row for relation "job_position_equipment" violates check constraint "job_position_equipment_duration_by_allocation"',
        details: 'Failing row contains (Manusi, 1, null).',
      },
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "clients_organization_cui_key"',
        details: 'Key (cui)=(12345674) already exists.',
      },
      {
        code: '23503',
        message:
          'insert or update on table "employees" violates foreign key constraint "employees_job_position_fkey"',
      },
      {
        code: '23502',
        message:
          'null value in column "risk" of relation "job_position_equipment" violates not-null constraint',
      },
      { code: '23514', message: 'Ion Popescu' },
    ].map((error) => fromDatabaseError(error, 'save'));

    expect(refused.map((error) => [error.code, error.constraint])).toEqual([
      [
        'validation_error',
        { name: 'job_position_equipment_duration_by_allocation', table: 'job_position_equipment' },
      ],
      ['conflict', { name: 'clients_organization_cui_key', table: null }],
      ['conflict', { name: 'employees_job_position_fkey', table: 'employees' }],
      [
        'internal_error',
        { name: 'job_position_equipment_risk_not_null', table: 'job_position_equipment' },
      ],
      ['validation_error', undefined],
    ]);
    expect(logged.mock.calls.map(([line]) => line)).toEqual([
      'Database request rejected (save): 23514 job_position_equipment_duration_by_allocation',
      'Database request rejected (save): 23505 clients_organization_cui_key',
      'Database request rejected (save): 23503 employees_job_position_fkey',
      'Database request rejected (save): 23502 job_position_equipment_risk_not_null',
      'Database request rejected (save): 23514',
    ]);
  });
});

describe('the knowledge tests errors', () => {
  it('words a test kept below ten questions as a conflict, the raised text its reason', () => {
    expect(
      fromDatabaseError({ code: 'TST01', message: 'test_below_minimum' }, 'hide')
    ).toMatchObject({
      code: 'conflict',
      reason: 'test_below_minimum',
      message: 'Un test trebuie să păstreze cel puțin zece întrebări active.',
    });
  });

  it('answers an answer that does not fit the attempt as invalid', () => {
    expect(
      fromDatabaseError({ code: 'TST04', message: 'option_out_of_range' }, 'answer')
    ).toMatchObject({ code: 'validation_error', reason: 'option_out_of_range' });
  });
});

describe('requestFetch', () => {
  const context = { req: { raw: new Request('https://api.test/') } } as unknown as Context<ApiEnv>;

  function upstreamTaking(ms: number, answer: () => Response) {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        now += ms;
        return answer();
      })
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('warns about a slow request, naming only the service and the resource', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(2_500, () => new Response(null, { status: 200 }));
    await requestFetch(
      context,
      8_000
    )('https://project.supabase.co/rest/v1/clients?id=eq.5d0f1a9e&select=*');
    expect(warned).toHaveBeenCalledWith(
      'Slow upstream request: project.supabase.co/rest/v1/clients took 2500 ms (status 200)'
    );
  });

  it('warns about a slow request that got no answer', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(5_000, () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    await expect(
      requestFetch(context, 5_000)('https://project.supabase.co/auth/v1/user')
    ).rejects.toThrow('timed out');
    expect(warned).toHaveBeenCalledWith(
      'Slow upstream request: project.supabase.co/auth/v1/user took 5000 ms (no response)'
    );
  });

  it('stays quiet about a quick request', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(300, () => new Response(null, { status: 200 }));
    await requestFetch(context, 8_000)('https://project.supabase.co/auth/v1/user');
    expect(warned).not.toHaveBeenCalled();
  });
});
