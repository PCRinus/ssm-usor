import { defaultParseSearch } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { filterSearchSchema } from '@/components/list-filters/url';

import { stringifySearch } from './search-params';

const documentation = filterSearchSchema(['none', 'in_progress', 'issued']);

describe('stringifySearch', () => {
  it('writes a list as a repeated key', () => {
    expect(stringifySearch({ documentation: ['none', 'issued'] })).toBe(
      '?documentation=none&documentation=issued'
    );
  });

  it('writes everything else as the router does by default', () => {
    expect(stringifySearch({ page: 2, q: 'Mureș', status: 'archived' })).toBe(
      '?page=2&q=Mure%C8%99&status=archived'
    );
    expect(defaultParseSearch(stringifySearch({ q: '123', flag: 'true' }))).toEqual({
      q: '123',
      flag: 'true',
    });
    expect(stringifySearch({})).toBe('');
    expect(stringifySearch({ documentation: [] })).toBe('');
  });

  it('reads back through the default parser and the filter schema', () => {
    const many: Record<string, unknown> = defaultParseSearch(
      stringifySearch({ documentation: ['none', 'issued'], page: 3 })
    );
    expect(many).toEqual({ documentation: ['none', 'issued'], page: 3 });
    expect(documentation.parse(many.documentation)).toEqual(['none', 'issued']);

    const one: Record<string, unknown> = defaultParseSearch(
      stringifySearch({ documentation: ['issued'] })
    );
    expect(documentation.parse(one.documentation)).toEqual(['issued']);
  });
});

describe('filterSearchSchema', () => {
  it('keeps the known values of a list, a single value or an old JSON link alike', () => {
    expect(documentation.parse('none')).toEqual(['none']);
    expect(documentation.parse(['none', 'unknown'])).toEqual(['none']);
    expect(
      documentation.parse(
        (defaultParseSearch('?documentation=%5B%22none%22%5D') as Record<string, unknown>)
          .documentation
      )
    ).toEqual(['none']);
    expect(documentation.parse(undefined)).toBeUndefined();
    expect(documentation.parse(['unknown'])).toBeUndefined();
  });

  it('reads a value that the parser turned into a number as text', () => {
    expect(filterSearchSchema(['12']).parse(12)).toEqual(['12']);
  });
});
