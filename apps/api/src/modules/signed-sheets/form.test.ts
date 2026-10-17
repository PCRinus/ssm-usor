import { readFileSync } from 'node:fs';

import {
  rowCapacity,
  sheetFieldNames,
  sheetRowKeys,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { renderDocument } from '@ssm-usor/document-engine';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  continuationLine,
  printedSheets,
  rowKindOf,
  rowValues,
  signatureFieldsOf,
  signedOn,
  signedSheetData,
  wrapToBox,
} from './form';
import { sheetFacts, sheetRecord } from './form.fixture';

describe('rowKindOf', () => {
  it('puts a supplementary training in its own table on the occupational safety sheet only', () => {
    expect(rowKindOf('ssm', 'supplementary')).toBe('s');
    expect(rowKindOf('psi', 'supplementary')).toBe('p');
    expect(rowKindOf('psi', 'workplace')).toBe('h2');
  });
});

describe('printedSheets', () => {
  it('prints the records from paper in the first rows, oldest first, and nothing recorded in the app', () => {
    const records = [
      sheetRecord('periodic', '2025-07-01', { source: 'paper' }),
      sheetRecord('periodic', '2025-01-10', { source: 'paper' }),
      sheetRecord('periodic', '2026-01-10'),
      sheetRecord('supplementary', '2025-03-01', {
        source: 'paper',
        training: { supplementaryReason: 'after_accident' },
      }),
      sheetRecord('introductory_general', '2024-12-01', { source: 'paper' }),
    ];
    const [first, ...rest] = printedSheets('ssm', records);
    expect(rest).toEqual([]);
    expect(first!.map((row) => [row.rowKey, row.record.training.heldOn])).toEqual([
      ['h1', '2024-12-01'],
      ['p1', '2025-01-10'],
      ['p2', '2025-07-01'],
      ['s1', '2025-03-01'],
    ]);
  });

  it('prints a hiring training from paper only while it is the latest of its phase', () => {
    const records = [
      sheetRecord('workplace', '2024-12-02', { source: 'paper' }),
      sheetRecord('workplace', '2026-02-01'),
    ];
    expect(printedSheets('psi', records)).toEqual([[]]);
  });

  it('runs a table of paper rows longer than a page onto continuation sheets', () => {
    const records = Array.from({ length: rowCapacity('psi') + 2 }, (_, index) =>
      sheetRecord('periodic', `2020-01-${String(index + 1).padStart(2, '0')}`, {
        source: 'paper',
        domain: 'psi',
      })
    );
    const sheets = printedSheets('psi', records);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toHaveLength(rowCapacity('psi'));
    expect(sheets[1]!.map((row) => row.rowKey)).toEqual(['p1', 'p2']);
    expect(sheets[1]![0]!.record.training.heldOn).toBe(`2020-01-${rowCapacity('psi') + 1}`);
  });
});

describe('signedSheetData', () => {
  const printed = printedSheets('ssm', [
    sheetRecord('introductory_general', '2024-12-01', { source: 'paper' }),
    sheetRecord('periodic', '2025-01-10', { source: 'paper' }),
  ])[0]!;

  it('turns the form on, the printed rows as text and every other row as fields', () => {
    const data = signedSheetData(sheetFacts, 'ssm', 1, printed);
    expect(data.form.on).toBe(true);
    expect(data.form.h1).toEqual({ paper: true });
    expect(data.form.h2).toEqual({ paper: false });
    expect(data.form.rows.p1).toBe(false);
    expect(data.form.rows.p2).toBe(true);
    expect(data.form.rows.s17).toBe(true);
    expect(data.form.continuation).toBe('');
    expect(data.periodic.map((row) => row.heldOn)).toEqual(['10.01.2025']);
    expect(data.hiring.introductory.heldOn).toBe('01.12.2024');
    expect(data.blankRows).toEqual({ periodic: [], supplementary: [] });
  });

  it('says on a continuation sheet which sheet it continues', () => {
    expect(signedSheetData(sheetFacts, 'psi', 3, []).form.continuation).toBe(continuationLine(3));
    expect(continuationLine(3)).toBe('Fișa nr. 3, în continuarea fișei nr. 2');
  });

  it('leaves out the signature fields of the printed rows', () => {
    const fields = signatureFieldsOf('ssm', printed);
    expect(fields).not.toContain('h1_sig_trainee');
    expect(fields).not.toContain('p1_sig_trainer');
    expect(fields).toContain('adm_sig');
    expect(fields).toContain('p2_sig_verifier');
    expect(fields).toHaveLength(3 + 1 + 3 * (2 * rowCapacity('ssm') - 1));
  });
});

describe('rowValues', () => {
  it('fills a periodic row as the paper sheet prints it, the material broken into lines', () => {
    const record = sheetRecord('periodic', '2026-04-03', {
      training: {
        durationMinutes: 90,
        material:
          'I.P.S.S.M. Art. 61 – 120; IP Sudură Art. 11 – 20; utilizarea echipamentului individual de protecție',
      },
    });
    const values = rowValues('ssm', 'p3', record, '');
    expect(values).toMatchObject({
      p3_date: '03.04.2026',
      p3_duration: '1,5',
      p3_occupation: 'Sudor',
      p3_note: '',
    });
    expect(values.p3_material!.split('\n').length).toBeGreaterThan(1);
    expect(values.p3_material!.replace(/\n/g, ' ')).toBe(record.training.material);
    expect(Object.keys(values).sort()).toEqual(
      [...sheetFieldNames('ssm', 'p3').text, 'p3_note'].sort()
    );
  });

  it("fills the workplace training's block and its admission, the place from the employee", () => {
    const record = sheetRecord('workplace', '2026-01-06', {
      domain: 'psi',
      admission: { admittedOn: '2026-01-07', name: 'Ion POP', jobTitle: 'Șef atelier' },
    });
    const values = rowValues('psi', 'h2', record, 'Punct de lucru – Atelier');
    expect(Object.keys(values).sort()).toEqual(
      [
        ...sheetFieldNames('psi', 'h2').text,
        'h2_note',
        ...sheetFieldNames('psi', 'adm').text,
      ].sort()
    );
    expect(values).toMatchObject({
      h2_place: 'Punct de lucru – Atelier',
      h2_occupation: 'Sudor',
      adm_date: '07.01.2026',
      adm_name: 'Ion POP',
    });
  });

  it('notes a record from paper as signed on paper, and gives the reason of a supplementary one', () => {
    const record = sheetRecord('supplementary', '2026-05-18', {
      source: 'paper',
      training: { material: 'IP Sudură.', supplementaryReason: 'after_accident' },
    });
    const values = rowValues('ssm', 's1', record, '');
    expect(values.s1_note).toBe('semnat pe hârtie');
    expect(values.s1_material).toContain('(motivul:');
  });
});

describe('wrapToBox', () => {
  it('keeps a short text on one line and breaks a longer one at the box width', () => {
    expect(wrapToBox('Sudor', { chars: 14, lines: 3 })).toBe('Sudor');
    expect(wrapToBox('unu doi trei patru', { chars: 8, lines: 3 })).toBe('unu doi\ntrei\npatru');
  });

  it('keeps a text too long for the box in its proportions, for the signer to shrink', () => {
    const long = Array.from({ length: 60 }, () => 'cuvânt').join(' ');
    const lines = wrapToBox(long, { chars: 29, lines: 3 }).split('\n');
    const widest = Math.max(...lines.map((line) => line.length));
    expect(lines.length / widest).toBeCloseTo(3 / 29, 1);
  });
});

describe('signedOn', () => {
  it("prints the day in Romania's time zone", () => {
    expect(signedOn(new Date('2026-10-17T22:30:00Z'))).toBe('18.10.2026');
  });
});

const templates = new URL('../../../../../packages/document-engine/templates/', import.meta.url);
const templateFiles: Record<TrainingDomain, string> = {
  ssm: 'fisa_instruire_ssm.docx',
  psi: 'fire/fisa_instructaj_psi.docx',
};

describe.each(['ssm', 'psi'] as const)('the %s template', (domain) => {
  it('has a field for every name of the contracts, and no other', () => {
    const docx = renderDocument(
      new Uint8Array(readFileSync(new URL(templateFiles[domain], templates))),
      signedSheetData(sheetFacts, domain, 1, [])
    );
    const titles = [
      ...new PizZip(docx)
        .file('word/document.xml')!
        .asText()
        .matchAll(/<w:alias w:val="([^"]+)"\/>/g),
    ].map((match) => match[1]!);
    const expected = sheetRowKeys(domain).flatMap((key) => {
      const fields = sheetFieldNames(domain, key);
      return [
        ...fields.text,
        ...(fields.note ? [fields.note] : []),
        ...Object.values(fields.signatures),
      ];
    });
    expect([...titles].sort()).toEqual([...expected].sort());
    expect(signatureFieldsOf(domain, []).every((name) => titles.includes(name))).toBe(true);
  });
});
