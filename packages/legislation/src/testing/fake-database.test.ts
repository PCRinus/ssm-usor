import { describe, expect, it } from 'vitest';

import { fakeDatabase } from './fake-database';

describe('the fake database', () => {
  it('answers a routed request and keeps what was sent', async () => {
    const { db, sent } = fakeDatabase({
      'legal_changes POST': () => Response.json([{ id: 'c1' }], { status: 201 }),
    });
    const { data } = await db
      .from('legal_changes')
      .insert({ act_id: 'lege-319-2006', consolidated_on: '2026-11-06' })
      .select('id');

    expect(data).toEqual([{ id: 'c1' }]);
    expect(sent('legal_changes', 'POST').map(({ body }) => body)).toEqual([
      { act_id: 'lege-319-2006', consolidated_on: '2026-11-06' },
    ]);
    expect(sent('legal_changes', 'GET')).toEqual([]);
  });

  it('fails a request no route answers', async () => {
    const { db } = fakeDatabase({});
    const { error } = await db.from('legal_acts').insert({ id: 'lege-319-2006', name: 'Legea' });

    expect(error?.message).toContain('Unexpected request: legal_acts POST');
  });
});
