import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { listPage } from './list-page';

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

  it('refuses a read that was not counted, rather than answer an empty list', async () => {
    const page = (counts: { rows: number | null; recount: number | null; all: number | null }) =>
      listPage({
        page: 1,
        pageSize: 25,
        rows: () => listed([{ id: 'a' }], counts.rows),
        recount: () => counted(counts.recount),
        unfiltered: () => counted(counts.all),
        what: 'clients',
      });
    await expect(page({ rows: null, recount: 1, all: 1 })).rejects.toThrow(/count: 'exact'/);
    await expect(page({ rows: 1, recount: 1, all: null })).rejects.toThrow(/count: 'exact'/);

    const pastTheEnd = listPage({
      page: 9,
      pageSize: 25,
      rows: () => listed(null, null, 'PGRST103'),
      recount: () => counted(null),
      what: 'clients',
    });
    await expect(pastTheEnd).rejects.toThrow(/count: 'exact'/);
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
