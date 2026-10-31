import { describe, expect, it } from 'vitest';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { clientId, importDetail, importId, summaryOf } from '@/test/import-fixture';

import { importReadyNotices, isMineRunning } from './import-ready-notices';

const me = 'user-one';
const otherId = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

function item(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryOf(importDetail()),
    expiresAt: null,
    people: null,
    uninvited: null,
    ...overrides,
  } as ImportListResponseItemsItem;
}

const client = { id: clientId, legalName: 'Brutăria Spicul Auriu SRL' };

const notices = (
  previous: Record<string, string>,
  items: ImportListResponseItemsItem[],
  options: { watching?: string; announced?: string[] } = {}
) =>
  importReadyNotices({
    previous: new Map(Object.entries(previous)),
    items,
    userId: me,
    watching: options.watching ?? null,
    announced: (id) => options.announced?.includes(id) ?? false,
  });

describe('importReadyNotices', () => {
  it('announces an employee import read since the last look, with the people left to check', () => {
    const { shown } = notices({ [importId]: 'reading' }, [
      item({
        kind: 'employees',
        status: 'ready',
        client,
        people: { total: 21, toCheck: 21, checked: 0, setAside: 0 },
      }),
    ]);

    expect(shown).toEqual([
      {
        importId,
        tone: 'success',
        title: 'Fișele de la Brutăria Spicul Auriu SRL sunt citite.',
        description: '21 de persoane te așteaptă la verificare.',
        action: 'Verifică persoanele',
        link: {
          to: '/clients/$clientId/employees/import/$importId',
          params: { clientId, importId },
        },
      },
    ]);
  });

  it('counts one person and a few people in Romanian', () => {
    const ready = (toCheck: number) =>
      notices({ [importId]: 'checking' }, [
        item({
          kind: 'employees',
          status: 'ready',
          client,
          people: { total: toCheck, toCheck, checked: 0, setAside: 0 },
        }),
      ]).shown[0]!.description;

    expect(ready(1)).toBe('1 persoană te așteaptă la verificare.');
    expect(ready(3)).toBe('3 persoane te așteaptă la verificare.');
  });

  it('announces a client proposal ready, for a new client and for one to complete', () => {
    expect(notices({ [importId]: 'checking' }, [item({ status: 'ready' })]).shown).toEqual([
      expect.objectContaining({
        tone: 'success',
        title: 'Propunerea pentru Brutăria Spicul Auriu SRL e gata.',
        description: 'Verifică datele înainte să creezi clientul.',
        action: 'Verifică propunerea',
        link: { to: '/clients/import/$importId', params: { importId } },
      }),
    ]);
    expect(
      notices({ [importId]: 'checking' }, [item({ status: 'ready', client })]).shown[0]!.description
    ).toBe('Verifică datele înainte să completezi clientul.');
  });

  it('says when a reading stopped, with the reason', () => {
    const { shown } = notices({ [importId]: 'reading' }, [
      item({ status: 'failed', failureReason: 'Citirea nu a reușit.' }),
    ]);

    expect(shown).toEqual([
      expect.objectContaining({
        tone: 'error',
        title: 'Importul pentru Brutăria Spicul Auriu SRL s-a oprit.',
        description: 'Citirea nu a reușit.',
        action: 'Vezi importul',
      }),
    ]);
  });

  it('announces several finished at once, one each', () => {
    const { shown } = notices({ [importId]: 'reading', [otherId]: 'sorting' }, [
      item({ status: 'ready' }),
      item({ id: otherId, kind: 'employees', status: 'ready', client }),
    ]);

    expect(shown.map((notice) => notice.importId)).toEqual([importId, otherId]);
  });

  it('stays quiet about an import first seen finished, still running or still uploading', () => {
    expect(notices({}, [item({ status: 'ready' })]).shown).toEqual([]);
    expect(notices({ [importId]: 'ready' }, [item({ status: 'ready' })]).shown).toEqual([]);
    expect(notices({ [importId]: 'sorting' }, [item({ status: 'reading' })]).shown).toEqual([]);
    expect(notices({ [importId]: 'uploading' }, [item({ status: 'failed' })]).shown).toEqual([]);
  });

  it("stays quiet about another member's import and one already announced", () => {
    const someoneElse = item({ status: 'ready', createdBy: { id: 'user-two', fullName: 'Ana' } });

    expect(notices({ [importId]: 'reading' }, [someoneElse]).shown).toEqual([]);
    expect(
      notices({ [importId]: 'reading' }, [item({ status: 'ready' })], { announced: [importId] })
        .shown
    ).toEqual([]);
  });

  it('keeps quiet about the import the member is looking at, and remembers it', () => {
    expect(
      notices({ [importId]: 'reading' }, [item({ status: 'ready' })], { watching: importId })
    ).toEqual({ shown: [], quiet: [importId] });
  });
});

describe('isMineRunning', () => {
  it("is true only for the member's own import still reading", () => {
    expect(isMineRunning([item({ status: 'reading' })], me)).toBe(true);
    expect(isMineRunning([item({ status: 'ready' }), item({ status: 'uploading' })], me)).toBe(
      false
    );
    expect(
      isMineRunning(
        [item({ status: 'reading', createdBy: { id: 'user-two', fullName: null } })],
        me
      )
    ).toBe(false);
  });
});
