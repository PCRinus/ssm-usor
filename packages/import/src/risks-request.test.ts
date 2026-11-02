import { describe, expect, it } from 'vitest';

import {
  retypeBatches,
  retypeRequest,
  risksAnswer,
  risksCharacters,
  risksRequest,
  RisksTooLargeError,
  withRetyped,
} from './risks-request';
import { numberRows, rowsBetween, splitCells } from './risks-rows';
import { answer, assessment, plan, scanned } from './test/risks-pack';

describe('numberRows', () => {
  it('numbers every table row across the files and leaves the prepared text as it was', () => {
    const before = assessment.text;
    const numbered = numberRows([assessment, plan]);

    expect(assessment.text).toBe(before);
    expect(numbered.rows).toHaveLength(41);
    expect(numbered.texts.get(plan.path)!.split('\n')[3]).toMatch(
      /^R39 \| 1 \| BRUTĂRIA DIN CURTE/
    );
    const row = numbered.byId.get('R8')!;
    expect(row.cells.slice(0, 3)).toEqual([
      '',
      '',
      'F2. Tăierea mâinilor cu cuțitul de feliat pâine.',
    ]);
    expect(assessment.text.slice(row.start, row.end)).toMatch(/^\| {2}\| {2}\| F2\./);
  });

  it('reads empty cells at either end of a row', () => {
    expect(splitCells('|  | 1 | 2 |')).toEqual(['', '1', '2']);
    expect(splitCells('| a |  |')).toEqual(['a', '']);
    expect(splitCells('Nu este un rând')).toBeNull();
  });

  it('keeps a span inside its own file', () => {
    const numbered = numberRows([assessment, plan]);

    expect(rowsBetween(numbered, 'R7', 'R9').map((row) => row.id)).toEqual(['R7', 'R8', 'R9']);
    expect(rowsBetween(numbered, 'R36', 'R40').map((row) => row.id)).toEqual(['R36']);
    expect(rowsBetween(numbered, 'R9', 'R7')).toEqual([]);
  });
});

describe('risksRequest', () => {
  const input = { files: [assessment, plan], posts: ['Brutar', 'Vânzător'] };

  it('asks GPT-6.1 Terra with the numbered files before the task, and the posts in the task', () => {
    const request = risksRequest(input);

    expect(request.model).toBe('gpt-6.1-terra');
    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user', 'system']);
    const files = request.messages[1]!.content as string;
    expect(files).toContain(`=== FILE: ${assessment.path} ===\nEVALUAREA RISCURILOR`);
    expect(files).toContain('R7 | MIJLOACE DE PRODUCŢIE | Factori de risc mecanic');
    const task = request.messages[2]!.content as string;
    expect(task).toContain('- Brutar\n- Vânzător');
    expect(task).toContain('factorRows');
  });

  it('sends scanned pages as images after their file', () => {
    const request = risksRequest({
      files: [
        {
          ...scanned,
          scans: [{ label: 'scan (pagina 2)', imageUrl: 'data:image/jpeg;base64,AA' }],
        },
      ],
      posts: [],
    });

    expect(request.messages[1]!.content).toEqual([
      { type: 'text', text: expect.stringContaining('CURIER') },
      { type: 'text', text: '=== FILE: scan (pagina 2) ===' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA' } },
    ]);
  });

  it('refuses a pack above the cap, with its size', () => {
    const large = {
      files: [{ path: 'Mare.docx', text: 'a'.repeat(risksCharacters + 1) }],
      posts: [],
    };

    expect(() => risksRequest(large)).toThrow(new RisksTooLargeError(risksCharacters + 1));
  });

  it('holds no nullable member and reads numbers written as text', () => {
    expect(JSON.stringify(risksAnswer.jsonSchema)).not.toContain('null');
    const wire = JSON.parse(JSON.stringify(answer)) as Record<string, unknown>;
    const sheets = (wire.sheets as Record<string, unknown>[]).map((sheet) => ({
      ...sheet,
      columns: { ...(sheet.columns as object), level: '7', consequence: '' },
    }));
    const parsed = risksAnswer.parse({ ...wire, sheets });

    expect(parsed.sheets[0]!.columns.level).toBe(7);
    expect(parsed.sheets[0]!.columns.consequence).toBeNull();
  });
});

describe('the sheets written out', () => {
  const unrowed = (index: number) => ({
    ...answer.sheets[0]!,
    file: scanned.path,
    heading: `Fișa ${index}`,
    firstRow: '',
    lastRow: '',
    factors: [],
  });
  const input = { files: [scanned], posts: [] };

  it('leaves the sheets past the eighth to later requests of eight, after the same files', () => {
    const many = {
      ...answer,
      sheets: Array.from({ length: 18 }, (_, index) => unrowed(index + 1)),
    };

    const batches = retypeBatches(input, many);

    expect(batches).toEqual([
      ['Fișa 9', 'Fișa 10', 'Fișa 11', 'Fișa 12', 'Fișa 13', 'Fișa 14', 'Fișa 15', 'Fișa 16'],
      ['Fișa 17', 'Fișa 18'],
    ]);
    const later = retypeRequest(input, batches[1]!);
    expect(later.messages[1]).toEqual(risksRequest(input).messages[1]);
    expect(later.messages[2]!.content).toContain('- Fișa 17\n- Fișa 18');
  });

  it('puts a later answer’s factors on the sheet of the same file and heading', () => {
    const factor = { ...retyped, quote: 'F2. Lovire' };
    const merged = withRetyped({ ...answer, sheets: [unrowed(1), unrowed(2)] }, [
      { sheets: [{ file: scanned.path, heading: 'Fișa 2', factors: [factor] }] },
    ]);

    expect(merged.sheets.map((sheet) => sheet.factors.length)).toEqual([0, 1]);
  });
});

const retyped = {
  component: 'MIJLOACE DE PRODUCȚIE',
  group: 'Factori de risc mecanic',
  description: 'F1. Accident rutier cu bicicleta de livrare.',
  consequence: 'Deces',
  gravity: '7',
  probability: '2',
  level: '4',
  quote: 'F1. Accident rutier cu bicicleta de livrare. Deces 7 2 4',
};
