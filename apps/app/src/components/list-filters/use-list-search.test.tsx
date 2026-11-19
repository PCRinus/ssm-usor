import { QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/lib/query-client';

import { PendingCountLabel } from './pending-count-label';
import { listPageSearchSchema, listSortSearchSchema, useListSearch } from './use-list-search';

const schema = listPageSearchSchema(['name', 'heldOn']);

describe('listPageSearchSchema', () => {
  it('keeps what the list knows and drops the rest', () => {
    expect(schema.parse({ page: 3, sort: 'heldOn', order: 'desc', q: 'Pop' })).toEqual({
      page: 3,
      sort: 'heldOn',
      order: 'desc',
      q: 'Pop',
    });
    expect(schema.parse({ page: 0, sort: 'salary', order: 'up', q: 'x'.repeat(101) })).toEqual({});
  });

  it('reads a search of digits as text', () => {
    expect(schema.parse({ q: 1590082 }).q).toBe('1590082');
  });
});

describe('listSortSearchSchema', () => {
  it('keeps a known sort and order and drops the rest, for a list sorted where it is read', () => {
    const sorted = listSortSearchSchema(['name', 'heldOn']);
    expect(sorted.parse({ sort: 'name', order: 'asc', page: 2 })).toEqual({
      sort: 'name',
      order: 'asc',
    });
    expect(sorted.parse({ sort: 'salary', order: 'up' })).toEqual({});
  });
});

type Search = { page?: number; sort?: 'name' | 'heldOn'; order?: 'asc' | 'desc'; q?: string };
type Kind = 'kind';

const current: Search & { kind?: string[]; open?: string } = {
  page: 4,
  sort: 'heldOn',
  order: 'asc',
  q: 'Pop',
  kind: ['a'],
  open: 'row',
};

function setup(extra: { reset?: Partial<Search & { open?: string }>; withState?: boolean } = {}) {
  const navigate = vi.fn<(options: unknown) => Promise<void>>(() => Promise.resolve());
  const keep = () => ({ opener: 1 });
  const { result } = renderHook(() =>
    useListSearch<Search & { kind?: string[]; open?: string }, Kind>({
      search: current,
      navigate,
      defaultSort: { sort: 'name', order: 'asc' },
      searchOf: (values) => ({ kind: values.kind ? [...values.kind] : undefined }),
      reset: extra.reset,
      state: extra.withState ? keep : undefined,
    })
  );
  const call = () => {
    const options = navigate.mock.lastCall?.[0] as {
      search: (prev: typeof current) => typeof current;
      replace?: boolean;
      resetScroll?: boolean;
      state?: unknown;
    };
    return { ...options, next: options.search(current) };
  };
  return { handlers: result.current, call, keep };
}

describe('useListSearch', () => {
  it('replaces the entry and goes back to the first page on a new search', () => {
    const { handlers, call } = setup();
    handlers.changeQuery('Ion');
    expect(call()).toMatchObject({ replace: true, resetScroll: false });
    expect(call().next).toEqual({ ...current, q: 'Ion', page: undefined });

    handlers.changeQuery('');
    expect(call().next.q).toBeUndefined();
  });

  it('writes the chosen filters through the list’s own reading of them', () => {
    const { handlers, call } = setup();
    handlers.changeFilters({ kind: ['b', 'c'] });
    expect(call().next).toEqual({ ...current, kind: ['b', 'c'], page: undefined });
    handlers.changeFilters({});
    expect(call().next.kind).toBeUndefined();
  });

  it('leaves the default sort out of the address', () => {
    const { handlers, call } = setup();
    handlers.onSortChange({ sort: 'name', order: 'asc' });
    expect(call().next).toMatchObject({ sort: undefined, order: undefined, page: undefined });
    handlers.onSortChange({ sort: 'heldOn', order: 'desc' });
    expect(call().next).toMatchObject({ sort: 'heldOn', order: 'desc', page: undefined });
  });

  it('adds an entry for a page turn and leaves the first page out', () => {
    const { handlers, call } = setup();
    handlers.onPageChange(2);
    expect(call().replace).toBeUndefined();
    expect(call().next).toEqual({ ...current, page: 2 });
    handlers.onPageChange(1);
    expect(call().next.page).toBeUndefined();
  });

  it('clears what the list resets and keeps the history state on every change', () => {
    const { handlers, call, keep } = setup({ reset: { open: undefined }, withState: true });
    handlers.changeQuery('Ion');
    expect(call().state).toBe(keep);
    expect(call().next.open).toBeUndefined();
    handlers.onPageChange(2);
    expect(call().state).toBe(keep);
    expect(call().next.open).toBeUndefined();
  });
});

describe('PendingCountLabel', () => {
  const noun = (count: number) => (count === 1 ? 'un rând' : `${count} rânduri`);

  function renderLabel(element: React.ReactNode) {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <span data-testid="label">{element}</span>
      </QueryClientProvider>
    );
  }

  it('names the count the chosen filters would show', async () => {
    renderLabel(
      <PendingCountLabel
        query={{ queryKey: ['rows', 'a'], queryFn: () => ({ total: 7 }) }}
        noun={noun}
      />
    );
    expect(screen.getByTestId('label').textContent).toBe('Arată rezultatele');
    expect(await screen.findByText('Arată 7 rânduri')).toBeTruthy();
  });

  it('counts what the caller names when the total is not the count', async () => {
    renderLabel(
      <PendingCountLabel
        query={{ queryKey: ['rows', 'b'], queryFn: () => ({ total: 2, signatures: 1 }) }}
        count={(data) => data.signatures}
        noun={noun}
      />
    );
    expect(await screen.findByText('Arată un rând')).toBeTruthy();
  });
});
