import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { listPage, matchingEveryTerm, orderedBy } from './list-page';

const listed = <Row>(data: Row[] | null, count: number | null, code?: string) =>
  Promise.resolve({ data, count, error: code ? { code, message: code } : null });
const counted = (count: number | null, code?: string) =>
  Promise.resolve({ count, error: code ? { code, message: code } : null });

describe('listPage', () => {
  it('reads the range of the page and counts the unfiltered list beside it', async () => {
    const rows = vi.fn(() => listed([{ id: 'a' }], 31));
    const recount = vi.fn(() => counted(0));

    const page = await listPage({
      page: 2,
      pageSize: 25,
      rows,
      recount,
      unfiltered: () => counted(40),
      what: 'clients',
    });

    expect(rows).toHaveBeenCalledWith(25, 49);
    expect(recount).not.toHaveBeenCalled();
    expect(page).toEqual({ rows: [{ id: 'a' }], total: 31, unfilteredTotal: 40 });
  });

  it('gives the total as the unfiltered total when nothing narrows the list', async () => {
    const page = await listPage({
      page: 1,
      pageSize: 25,
      rows: () => listed([], 12),
      recount: () => counted(0),
      what: 'clients',
    });
    expect(page).toEqual({ rows: [], total: 12, unfilteredTotal: 12 });
  });

  it('answers a page past the end empty, with the totals counted again', async () => {
    const page = await listPage({
      page: 9,
      pageSize: 25,
      rows: () => listed(null, null, 'PGRST103'),
      recount: () => counted(3),
      unfiltered: () => counted(7),
      what: 'clients',
    });
    expect(page).toEqual({ rows: [], total: 3, unfilteredTotal: 7 });
  });

  it('turns any other failure into the API error of its database code', async () => {
    const failed = listPage({
      page: 1,
      pageSize: 25,
      rows: () => listed(null, null, '42501'),
      recount: () => counted(0),
      what: 'clients',
    });
    await expect(failed).rejects.toBeInstanceOf(ApiError);
    await expect(failed).rejects.toMatchObject({ code: 'forbidden' });

    const uncounted = listPage({
      page: 1,
      pageSize: 25,
      rows: () => listed([], 0),
      recount: () => counted(0),
      unfiltered: () => counted(null, '42501'),
      what: 'clients',
    });
    await expect(uncounted).rejects.toMatchObject({ code: 'forbidden' });
  });
});

type Call = [string, ...unknown[]];

function recorder() {
  const calls: Call[] = [];
  const query = {
    order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
      calls.push(['order', column, options]);
      return query;
    },
    ilike(column: string, pattern: string) {
      calls.push(['ilike', column, pattern]);
      return query;
    },
  };
  return { query, calls };
}

describe('orderedBy', () => {
  it('orders by each column in turn, as asked, reversed, ascending always or nulls last', () => {
    const { query, calls } = recorder();
    orderedBy(
      query,
      [
        { column: 'state', alwaysAscending: true },
        { column: 'count', reversed: true },
        { column: 'due_on', nullsLast: true },
        { column: 'name' },
      ],
      'desc'
    );
    expect(calls).toEqual([
      ['order', 'state', { ascending: true }],
      ['order', 'count', { ascending: true }],
      ['order', 'due_on', { ascending: false, nullsFirst: false }],
      ['order', 'name', { ascending: false }],
    ]);
  });
});

describe('matchingEveryTerm', () => {
  it('asks the column to hold every term', () => {
    const { query, calls } = recorder();
    matchingEveryTerm(query, 'search_text', ['popescu', '12']);
    expect(calls).toEqual([
      ['ilike', 'search_text', '*popescu*'],
      ['ilike', 'search_text', '*12*'],
    ]);
  });
});
