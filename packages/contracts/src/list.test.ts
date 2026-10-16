import { describe, expect, it } from 'vitest';

import { listQuerySchema, pageBounds, pageCount, pageRange, searchTerms } from './list';

const schema = listQuerySchema(['name', 'hiredAt'], 'name');

describe('list query', () => {
  it('applies defaults and coerces numbers from query strings', () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 25, sort: 'name', order: 'asc' });
    expect(schema.parse({ page: '3', pageSize: '50', sort: 'hiredAt', order: 'desc' })).toEqual({
      page: 3,
      pageSize: 50,
      sort: 'hiredAt',
      order: 'desc',
    });
  });

  it.each([{ page: '0' }, { pageSize: '101' }, { sort: 'cnp' }, { order: 'up' }, { page: '1.5' }])(
    'rejects %j',
    (query) => {
      expect(schema.safeParse(query).success).toBe(false);
    }
  );
});

describe('page arithmetic', () => {
  it('computes zero-based inclusive ranges', () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it('computes page counts and display bounds', () => {
    expect(pageCount({ page: 1, pageSize: 25, total: 0 })).toBe(1);
    expect(pageCount({ page: 1, pageSize: 25, total: 26 })).toBe(2);
    expect(pageBounds({ page: 1, pageSize: 25, total: 0 })).toEqual({ first: 0, last: 0 });
    expect(pageBounds({ page: 2, pageSize: 25, total: 30 })).toEqual({ first: 26, last: 30 });
  });
});

describe('search terms', () => {
  it('lowercases, drops diacritics and splits on anything but letters and digits', () => {
    expect(searchTerms('  Ștefan   ȚĂRANU ')).toEqual(['stefan', 'taranu']);
    expect(searchTerms('Șantierul Naval, S.A.')).toEqual(['santierul', 'naval', 's', 'a']);
    expect(searchTerms('A-17')).toEqual(['a', '17']);
    expect(searchTerms('ş ţ î â ă')).toEqual(['s', 't', 'i', 'a', 'a']);
  });

  it('gives nothing to match for an empty or punctuation-only query', () => {
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('*,()".:')).toEqual([]);
  });
});
