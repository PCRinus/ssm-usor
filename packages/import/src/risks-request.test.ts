import { describe, expect, it } from 'vitest';

import { GatewayError, ModelAnswerError } from './gateway';
import { noUsage } from './models';
import {
  placeRetyped,
  type RetypeAsk,
  retypeBatches,
  type RetypedAnswer,
  retypedAnswer,
  retypedFactorsPerRequest,
  retypedFactorTokens,
  retypeRequest,
  retypeSheets,
  risksAnswer,
  risksCharacters,
  risksOutputTokens,
  risksRequest,
  RisksTooLargeError,
  withRetyped,
} from './risks-request';
import { numberRows, rowsBetween, splitCells, squeezeLayout } from './risks-rows';
import { answer, assessment, plan, scanned, unplanned } from './test/risks-pack';

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

  it('asks each post’s sheet for a name of its work, reusable at other employers, "" read as none', () => {
    const task = risksRequest(input).messages[2]!.content as string;

    expect(task).toMatch(/workName: for job_position, .*reused at other employers/u);
    expect(task).toContain("Never the client's name, a person's name");
    expect(task).toContain('two sheets never share a name');
    const wire = JSON.parse(JSON.stringify(answer)) as { sheets: Record<string, unknown>[] };
    const parsed = risksAnswer.parse({
      ...wire,
      sheets: wire.sheets.map((sheet) => ({ ...sheet, workName: sheet.workName ?? '' })),
    });
    expect(parsed.sheets.map((sheet) => sheet.workName)).toEqual([
      'Producție de panificație',
      'Vânzare în magazin',
      null,
      null,
    ]);
  });
});

describe('the sheets written out', () => {
  const unrowed = (index: number, factorCount: number | null = 30) => ({
    ...answer.sheets[0]!,
    file: scanned.path,
    heading: `Fișa ${index}`,
    firstRow: '',
    lastRow: '',
    factorCount,
    factors: [],
  });
  const input = { files: [scanned], posts: [] };
  const pack = (counts: (number | null)[]) => ({
    ...answer,
    sheets: counts.map((count, index) => unrowed(index + 1, count)),
  });
  const headings = (batches: { heading: string }[][]) =>
    batches.map((batch) => batch.map((sheet) => sheet.heading));

  it('asks the first request for each sheet’s factor count and for no factor written out', () => {
    const task = risksRequest(input).messages[2]!.content as string;

    expect(task).toContain('factorCount');
    expect(JSON.stringify(risksAnswer.jsonSchema)).not.toContain('"quote"');
    const wire = JSON.parse(JSON.stringify(answer)) as { sheets: Record<string, unknown>[] };
    const parsed = risksAnswer.parse({
      ...wire,
      sheets: wire.sheets.map((sheet) => ({ ...sheet, factorCount: '36' })),
    });
    expect(parsed.sheets[0]).toMatchObject({ factorCount: 36, factors: [] });
  });

  it('sizes the batches by the factors counted, well under the output limit', () => {
    expect(retypedFactorsPerRequest * retypedFactorTokens).toBeLessThanOrEqual(
      risksOutputTokens / 3
    );
    const batches = retypeBatches(input, pack([15, 15, 24, 5, 5, 5, 18]));

    expect(headings(batches)).toEqual([
      ['Fișa 1', 'Fișa 2'],
      ['Fișa 3', 'Fișa 4', 'Fișa 5'],
      ['Fișa 6', 'Fișa 7'],
    ]);
    expect(batches[0]!.map((sheet) => sheet.index)).toEqual([1, 2]);
    const later = retypeRequest(input, batches[2]!);
    expect(later.messages[1]).toEqual(risksRequest(input).messages[1]);
    expect(later.messages[2]!.content).toContain('- Fișa 6\n- Fișa 7');
  });

  it('asks for a sheet larger than a batch on its own, and assumes a size for one not counted', () => {
    expect(headings(retypeBatches(input, pack([200, 10, null, 30])))).toEqual([
      ['Fișa 1'],
      ['Fișa 2'],
      ['Fișa 3'],
      ['Fișa 4'],
    ]);
  });

  it('leaves out a sheet with rows', () => {
    const sheets = [unrowed(1), { ...unrowed(2), file: assessment.path, firstRow: 'R7' }];
    const batches = retypeBatches(
      { files: [scanned, assessment], posts: [] },
      { ...answer, sheets }
    );

    expect(headings(batches)).toEqual([['Fișa 1']]);
  });

  it('places an answer’s sheets on those asked for, by heading, even written a little differently', () => {
    const asked = retypeBatches(input, pack([10, 10]))[0]!;
    const placed = placeRetyped(asked, {
      sheets: [
        { file: 'evaluare.pdf', heading: 'FIȘA 2', factors: [retyped] },
        { file: scanned.path, heading: 'Fișa 9', factors: [retyped] },
      ],
    });

    expect(placed.sheets).toEqual([{ file: scanned.path, heading: 'Fișa 2', factors: [retyped] }]);
  });

  type Asked = Parameters<RetypeAsk>;
  const answering =
    (respond: (key: string, asked: string[]) => RetypedAnswer | Error) =>
    async (...[key, request]: Asked) => {
      const task = request.messages[2]!.content as string;
      const asked = [...task.matchAll(/^- (Fișa \d+)$/gmu)].map((match) => match[1]!);
      const answered = respond(key, asked);
      if (answered instanceof Error) throw answered;
      return answered;
    };
  const written = (asked: string[], count = 20) => ({
    sheets: asked.map((heading) => ({
      file: scanned.path,
      heading,
      factors: Array.from({ length: count }, () => retyped),
    })),
  });
  const lengths = (later: RetypedAnswer[], counts: (number | null)[]) =>
    withRetyped(pack(counts), later).sheets.map((sheet) => sheet.factors.length);
  const cut = new ModelAnswerError('The answer stopped early (length).', 'incomplete', noUsage, 0);

  it('asks again in halves for a batch whose answer was cut, each named by its sheets', async () => {
    const keys: string[] = [];
    const later = await retypeSheets(
      input,
      pack([10, 10, 10]),
      answering((key, asked) => {
        keys.push(key);
        return asked.length > 2 ? cut : written(asked);
      })
    );

    expect(keys).toEqual(['1-2-3', '1-2', '3']);
    expect(lengths(later, [10, 10, 10])).toEqual([20, 20, 20]);
  });

  it('asks again alone for a sheet an answer left out, or wrote out under half of', async () => {
    const keys: string[] = [];
    const later = await retypeSheets(
      input,
      pack([10, 10, 10]),
      answering((key, asked) => {
        keys.push(key);
        if (asked.length === 1) return written(asked);
        return {
          sheets: [...written(['Fișa 1']).sheets, ...written(['Fișa 2'], 4).sheets],
        };
      })
    );

    expect(keys).toEqual(['1-2-3', '2', '3']);
    expect(lengths(later, [10, 10, 10])).toEqual([20, 20, 20]);
  });

  it('asks once more for a sheet asked alone and written out short, and keeps the longer answer', async () => {
    const keys: string[] = [];
    const counts = [36, 47];
    const later = await retypeSheets(
      input,
      pack(counts),
      answering((key, asked) => {
        keys.push(key);
        if (key === '1') return written(asked, 1);
        if (key === '1.again') return written(asked, 36);
        return written(asked, key === '2' ? 1 : 0);
      })
    );

    expect(keys).toEqual(['1', '1.again', '2', '2.again']);
    expect(lengths(later, counts)).toEqual([36, 1]);
  });

  it('keeps whatever a sheet the first answer gave no count for is written out with', async () => {
    const keys: string[] = [];
    const later = await retypeSheets(
      input,
      pack([null]),
      answering((key, asked) => {
        keys.push(key);
        return written(asked, 3);
      })
    );

    expect(keys).toEqual(['1']);
    expect(lengths(later, [0])).toEqual([3]);
  });

  it('asks again for a sheet whose rows were answered with where they are instead of what they hold', async () => {
    const keys: string[] = [];
    const pointers = (asked: string[]) => ({
      sheets: asked.map((heading) => ({
        file: scanned.path,
        heading,
        factors: Array.from({ length: 20 }, (_, row) => ({
          ...retyped,
          description: `p. 29, rând F${row + 1}, coloana 2`,
          gravity: `p. 29, F${row + 1}, coloana 4`,
          probability: `p. 29, F${row + 1}, coloana 5`,
        })),
      })),
    });
    const later = await retypeSheets(
      input,
      pack([20]),
      answering((key, asked) => {
        keys.push(key);
        return key === '1' ? pointers(asked) : written(asked);
      })
    );

    expect(keys).toEqual(['1', '1.again']);
    const [sheet] = withRetyped(pack([20]), later).sheets;
    expect(sheet!.factors[0]!.description).toBe(retyped.description);
  });

  it('fails the reading when a single sheet’s answer is cut, or the model refuses', async () => {
    await expect(
      retypeSheets(
        input,
        pack([20]),
        answering(() => cut)
      )
    ).rejects.toBe(cut);
    const refused = new ModelAnswerError('The model refused: no.', 'refused', noUsage, 0);
    const keys: string[] = [];
    await expect(
      retypeSheets(
        input,
        pack([10, 10]),
        answering((key) => {
          keys.push(key);
          return refused;
        })
      )
    ).rejects.toBe(refused);
    expect(keys).toEqual(['1-2']);
  });

  it('finishes the other batches before it fails, so their answers are kept', async () => {
    const keys: string[] = [];
    const failure = new GatewayError('The gateway answered 500.', 500, noUsage, 0);
    await expect(
      retypeSheets(
        input,
        pack([60, 60, 60]),
        answering((key, asked) => {
          keys.push(key);
          return key === '1' ? failure : written(asked, 60);
        })
      )
    ).rejects.toBe(failure);
    expect(keys.sort()).toEqual(['1', '2', '3']);
  });

  it('sends the first batch alone, and the others together only once it has finished', async () => {
    const events: string[] = [];
    await retypeSheets(input, pack([60, 60, 60, 60]), async (key, request) => {
      events.push(`asked ${key}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push(`answered ${key}`);
      const task = request.messages[2]!.content as string;
      return written(
        [...task.matchAll(/^- (Fișa \d+)$/gmu)].map((match) => match[1]!),
        60
      );
    });

    expect(events).toEqual([
      'asked 1',
      'answered 1',
      'asked 2',
      'asked 3',
      'asked 4',
      'answered 2',
      'answered 3',
      'answered 4',
    ]);
  });

  it('asks for each factor’s measures by kind and plan fields, "" read as none', () => {
    const task = retypeRequest(input, [{ heading: 'Fișa 1' }]).messages[2]!.content as string;

    expect(task).toContain('measures');
    expect(task).toContain('responsiblePerson');
    expect(JSON.stringify(retypedAnswer.jsonSchema)).not.toContain('null');
    const parsed = retypedAnswer.parse({
      sheets: [
        {
          file: scanned.path,
          heading: 'Fișa 1',
          factors: [
            {
              ...retyped,
              measuresFrom: '',
              measures: [],
              actions: '',
              deadline: ' ',
              responsiblePerson: '',
              observations: '',
            },
            {
              ...retyped,
              measuresFrom: 'plan',
              measures: [{ kind: 'technical', description: 'Frâne verificate.' }],
              actions: '',
              deadline: 'Periodic',
              responsiblePerson: 'Administrator',
              observations: '',
            },
          ],
        },
      ],
    });

    expect(parsed.sheets[0]!.factors[0]).toMatchObject(unplanned);
    expect(parsed.sheets[0]!.factors[1]).toMatchObject({
      measuresFrom: 'plan',
      measures: [{ kind: 'technical', description: 'Frâne verificate.' }],
      deadline: 'Periodic',
      responsiblePerson: 'Administrator',
      actions: null,
    });
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
  ...unplanned,
};

describe('squeezeLayout', () => {
  it('shortens the padding of a PDF layout line and keeps its columns apart', () => {
    expect(
      squeezeLayout(
        'F3. Cădere pe pardoseală          ITM 3-45 zile        2     3     2   \nUrmătorul rând'
      )
    ).toBe('F3. Cădere pe pardoseală  ITM 3-45 zile  2  3  2\nUrmătorul rând');
  });
});
