import { describe, expect, it } from 'vitest';

import {
  type BehindType,
  confirmAllCopy,
  finishedNotice,
  type RegenerationJob,
} from './regeneration-copy';

const client = (index: number, status: 'draft' | 'issued', editedDraft = false) => ({
  documentId: `d-${index}`,
  clientId: `c-${index % 5}`,
  clientName: `Client ${index % 5}`,
  version: 1,
  editedDraft,
  behindTemplate: true,
  instructionChanges: [],
  status,
  issueDate: '2026-10-14',
});

const type = (typeKey: string, clients: BehindType['clients']): BehindType => ({
  typeKey,
  title: typeKey,
  set: 'occupational_safety',
  newestVersion: { version: 2, kind: 'legal', note: null },
  legalChanges: [],
  runningJobId: null,
  clients,
});

const job = (typeKey: string, done: number, failed: number): RegenerationJob => ({
  id: `job-${typeKey}`,
  typeKey,
  requestedAt: '2026-11-19T08:00:00Z',
  finishedAt: '2026-11-19T08:01:00Z',
  total: done + failed,
  done,
  skipped: 0,
  failed,
  items: [
    ...Array.from({ length: done }, (_, index) => ({
      clientId: `c-${index}`,
      clientName: `Client ${index}`,
      status: 'done' as const,
      detail: null,
      missing: [],
    })),
    ...Array.from({ length: failed }, (_, index) => ({
      clientId: `f-${index}`,
      clientName: `Failed ${index}`,
      status: 'failed' as const,
      detail: 'Lipsesc date.',
      missing: [],
    })),
  ],
});

describe('the regeneration copy', () => {
  it('counts the documents of a set with "de" from twenty, leaving the edited drafts out', () => {
    const many = type(
      'decision_training',
      Array.from({ length: 22 }, (_, index) => client(index, index % 2 ? 'draft' : 'issued'))
    );
    const edited = type('event_registers', [client(30, 'draft', true), client(31, 'draft', true)]);
    const copy = confirmAllCopy('occupational_safety', [many, edited]);
    expect(copy.title).toBe('Regenerezi 22 de documente SSM la 5 clienți?');
    expect(copy.confirm).toBe('Regenerează 22 de documente');
    expect(copy.lines.map((line) => `${line.lead}${line.rest}`)).toEqual([
      '11 documente emise rămân în vigoare. Fiecare primește o ciornă nouă, pe care o emiți de pe pagina clientului.',
      '11 ciorne se înlocuiesc cu ciorne noi.',
      '2 ciorne editate de mână rămân neatinse, ca să nu pierzi ce ai scris în ele: „event_registers”, la Client 0; „event_registers”, la Client 1.',
    ]);
  });

  it('words the end of one document and of a whole set', () => {
    expect(
      finishedNotice(
        'one',
        'occupational_safety',
        [job('decision_training', 3, 0)],
        {
          decision_training: 'Decizia privind responsabilii cu instruirea',
        },
        1
      )
    ).toEqual({
      title: 'Decizia privind responsabilii cu instruirea, regenerat la 3 clienți',
      description: '3 ciorne noi de emis. Ciorna editată de mână a rămas neatinsă.',
      shortfall: null,
    });
    expect(
      finishedNotice(
        'all',
        'fire_safety',
        [job('fire_registers', 2, 1), job('fire_decision_training', 1, 0)],
        {},
        0
      )
    ).toEqual({
      title: '3 documente SU regenerate',
      description: '3 ciorne noi de emis, la 2 clienți.',
      shortfall: '1 nu s-a putut regenera.',
    });
  });
});
