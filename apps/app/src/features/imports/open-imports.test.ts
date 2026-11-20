import { describe, expect, it } from 'vitest';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { clientId, importDetail, summaryOf } from '@/test/import-fixture';

import {
  bandOf,
  closedSince,
  isAnyMoving,
  openImportsOf,
  statusesOf,
  waitingCounts,
} from './open-imports';

const now = Date.parse('2026-11-19T12:00:00+02:00');
const later = '2026-12-03T12:00:00+02:00';
const past = '2026-11-18T12:00:00+02:00';

let serial = 0;

function item(overrides: Record<string, unknown> = {}) {
  serial += 1;
  return {
    ...summaryOf(importDetail()),
    id: `7a000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    expiresAt: null,
    people: null,
    uninvited: null,
    progress: null,
    createdAt: '2026-11-18T09:00:00+02:00',
    ...overrides,
  } as ImportListResponseItemsItem;
}

const hotel = { id: clientId, legalName: 'Hotel Carpați Sinaia SRL' };

const confirmedWith = (parts: { part: string; status: string; expiresAt: string | null }[]) =>
  item({
    status: 'confirmed',
    client: hotel,
    intoExistingClient: true,
    confirmedAt: '2026-11-14T10:00:00+02:00',
    libraryParts: parts,
  });

describe('bandOf', () => {
  it('puts each open import in the band of what it waits for', () => {
    expect(bandOf(item({ status: 'ready' }), now)).toBe('review');
    expect(bandOf(item({ status: 'failed' }), now)).toBe('stopped');
    for (const status of ['preparing', 'sorting', 'reading', 'checking']) {
      expect(bandOf(item({ status }), now)).toBe('reading');
    }
    expect(bandOf(item({ status: 'uploading', createdAt: '2026-11-19T11:55:00+02:00' }), now)).toBe(
      'reading'
    );
    expect(bandOf(item({ status: 'uploading', createdAt: '2026-11-19T09:00:00+02:00' }), now)).toBe(
      'stopped'
    );
    expect(bandOf(item({ status: 'abandoned' }), now)).toBeNull();
  });

  it('keeps a confirmed client import while a library part is open, by what the parts wait for', () => {
    expect(
      bandOf(
        confirmedWith([
          { part: 'instructions_ssm', status: 'reading', expiresAt: later },
          { part: 'risk_evaluations', status: 'nothing_new', expiresAt: later },
        ]),
        now
      )
    ).toBe('review');
    expect(
      bandOf(
        confirmedWith([
          { part: 'instructions_ssm', status: 'to_review', expiresAt: past },
          { part: 'risk_evaluations', status: 'reading', expiresAt: later },
          { part: 'instructions_su', status: 'failed', expiresAt: later },
        ]),
        now
      )
    ).toBe('reading');
    expect(
      bandOf(confirmedWith([{ part: 'risk_evaluations', status: 'failed', expiresAt: later }]), now)
    ).toBe('stopped');
    expect(
      bandOf(
        confirmedWith([
          { part: 'instructions_ssm', status: 'to_review', expiresAt: past },
          { part: 'instructions_su', status: 'confirmed', expiresAt: later },
        ]),
        now
      )
    ).toBeNull();
    expect(bandOf(item({ status: 'confirmed', kind: 'employees', client: hotel }), now)).toBeNull();
  });
});

describe('openImportsOf', () => {
  it('lists the whole team’s imports of one kind, with their state and what to do', () => {
    const groups = openImportsOf(
      [
        item({
          status: 'ready',
          companyName: 'Transcom Logistic SRL',
          fileCount: 23,
          expiresAt: later,
          createdBy: { id: 'user-two', fullName: 'Andreea Mureșan' },
        }),
        confirmedWith([
          { part: 'instructions_ssm', status: 'to_review', expiresAt: '2026-11-28T12:00:00+02:00' },
          { part: 'risk_evaluations', status: 'to_review', expiresAt: later },
        ]),
        item({
          status: 'reading',
          companyName: null,
          fileCount: 17,
          createdAt: '2026-11-19T10:42:00+02:00',
          progress: { files: 17, prepared: 17, scans: 17, scansRead: 11 },
        }),
        item({
          status: 'failed',
          companyName: 'Clinica Dentară Zâmbet SRL',
          fileCount: 6,
          failureReason: 'Arhiva ZIP e protejată cu parolă.',
        }),
        item({ kind: 'employees', status: 'ready', client: hotel }),
      ],
      'client',
      now
    );

    expect(
      groups.review.map(({ name, detail, state, stateNote, action, started, startedBy }) => ({
        name,
        detail,
        state,
        stateNote,
        action,
        started,
        startedBy,
      }))
    ).toEqual([
      {
        name: 'Transcom Logistic SRL',
        detail: 'Client nou · Dosarul SSM și SU · 23 de fișiere',
        state: 'Propunere de verificat',
        stateNote: 'Până pe 3 dec.',
        action: 'Verifică propunerea',
        started: '18 nov.',
        startedBy: 'Andreea Mureșan',
      },
      {
        name: 'Hotel Carpați Sinaia SRL',
        detail: 'Client completat · Instrucțiuni și evaluări de risc',
        state: '2 părți de verificat',
        stateNote: 'Până pe 28 nov.',
        action: 'Verifică părțile',
        started: '18 nov.',
        startedBy: 'Radu Pop',
      },
    ]);
    expect(groups.reading).toMatchObject([
      {
        name: 'Client nou din documente',
        detail: 'Dosarul SSM și SU · 17 fișiere',
        state: 'Se citește documentația',
        stateNote: 'Pasul 3 din 4 · 11 din 17 scanări citite',
        progress: (11 / 17) * 100,
        action: null,
        started: expect.stringMatching(/^Azi, \d{2}:42$/),
      },
    ]);
    expect(groups.stopped).toMatchObject([
      {
        name: 'Clinica Dentară Zâmbet SRL',
        state: 'S-a oprit',
        stateNote: 'Arhiva ZIP e protejată cu parolă.',
        action: 'Vezi importul',
      },
    ]);
  });

  it('describes the people of an employee import and links to its client', () => {
    const ready = item({
      kind: 'employees',
      status: 'ready',
      client: hotel,
      intoExistingClient: true,
      fileCount: 41,
      expiresAt: '2026-12-02T12:00:00+02:00',
      people: { total: 36, toCheck: 9, checked: 24, setAside: 3 },
    });
    const reading = item({
      kind: 'employees',
      status: 'reading',
      client: hotel,
      fileCount: 28,
      progress: { files: 28, prepared: 28, scans: 28, scansRead: 12 },
    });
    const groups = openImportsOf([ready, reading], 'employees', now);

    expect(groups.review).toMatchObject([
      {
        name: 'Hotel Carpați Sinaia SRL',
        detail: 'Fișe de instruire · 41 de fotografii',
        state: '9 persoane de verificat',
        stateNote: '24 verificate, 3 lăsate deoparte · până pe 2 dec.',
        action: 'Verifică persoanele',
        link: {
          to: '/clienti/$clientId/angajati/import/$importId',
          params: { clientId, importId: ready.id },
        },
      },
    ]);
    expect(groups.reading).toMatchObject([
      { state: 'Se citesc fotografiile', stateNote: '12 din 28 de fotografii citite' },
    ]);
  });

  it('reads an upload under way as reading, and a stalled one as stopped', () => {
    const groups = openImportsOf(
      [
        item({ status: 'uploading', createdAt: '2026-11-19T11:55:00+02:00' }),
        item({ status: 'uploading', createdAt: '2026-11-19T09:00:00+02:00' }),
      ],
      'client',
      now
    );
    expect(groups.reading.map((row) => [row.state, row.stateNote])).toEqual([
      ['Se încarcă fișierele', null],
    ]);
    expect(groups.stopped).toMatchObject([
      {
        state: 'S-a oprit',
        stateNote: 'Încărcarea nu s-a terminat, așa că citirea n-a pornit.',
        action: 'Vezi importul',
      },
    ]);
  });

  it('names the library parts a confirmed import could not read', () => {
    const groups = openImportsOf(
      [confirmedWith([{ part: 'risk_evaluations', status: 'failed', expiresAt: later }])],
      'client',
      now
    );
    expect(groups.stopped).toMatchObject([
      {
        detail: 'Client completat · Evaluări de risc',
        state: 'S-a oprit',
        stateNote: 'Nu s-au putut citi evaluările de risc.',
        action: 'Vezi importul',
      },
    ]);
  });

  it('names the library parts a confirmed import still reads', () => {
    const groups = openImportsOf(
      [
        confirmedWith([
          { part: 'instructions_ssm', status: 'reading', expiresAt: null },
          { part: 'instructions_su', status: 'confirmed', expiresAt: later },
        ]),
      ],
      'client',
      now
    );
    expect(groups.reading).toMatchObject([
      {
        detail: 'Client completat · Instrucțiuni',
        state: 'Se citesc instrucțiunile',
        progress: null,
        action: null,
        tile: 'parts',
      },
    ]);
  });
});

describe('waitingCounts', () => {
  it('counts what waits for a check on each tab and in all', () => {
    const counts = waitingCounts(
      [
        item({ status: 'ready' }),
        item({ status: 'reading' }),
        confirmedWith([{ part: 'risk_evaluations', status: 'nothing_new', expiresAt: later }]),
        confirmedWith([{ part: 'risk_evaluations', status: 'failed', expiresAt: later }]),
        item({ kind: 'employees', status: 'ready', client: hotel }),
        item({ status: 'failed' }),
      ],
      now
    );
    expect(counts).toEqual({ client: 2, employees: 1, total: 3 });
  });
});

describe('isAnyMoving', () => {
  it('is true while anyone’s import or a library part is still being read', () => {
    expect(isAnyMoving([item({ status: 'ready' }), item({ status: 'failed' })], now)).toBe(false);
    expect(
      isAnyMoving([item({ status: 'reading', createdBy: { id: 'user-two', fullName: null } })], now)
    ).toBe(true);
    expect(
      isAnyMoving(
        [confirmedWith([{ part: 'risk_evaluations', status: 'reading', expiresAt: null }])],
        now
      )
    ).toBe(true);
    expect(
      isAnyMoving([item({ status: 'uploading', createdAt: '2026-11-19T11:55:00+02:00' })], now)
    ).toBe(true);
  });
});

describe('closedSince', () => {
  it('is true only when an import left the open list or was confirmed', () => {
    const ready = item({ status: 'ready' });
    const reading = item({ status: 'reading' });
    const before = statusesOf([ready, reading]);

    expect(closedSince(before, [ready, { ...reading, status: 'checking' }])).toBe(false);
    expect(closedSince(before, [ready, reading, item({ status: 'uploading' })])).toBe(false);
    expect(closedSince(before, [reading])).toBe(true);
    expect(closedSince(before, [{ ...ready, status: 'confirmed' }, reading])).toBe(true);
    const confirmed = { ...ready, status: 'confirmed' } as ImportListResponseItemsItem;
    expect(closedSince(statusesOf([confirmed]), [confirmed])).toBe(false);
  });
});
