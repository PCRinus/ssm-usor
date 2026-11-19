import { describe, expect, it } from 'vitest';

import { sheetPageMessages, sheetPageSystemPrompt } from './prompts';
import { sheetDate, sheetPageAnswer } from './sheet-page';
import { comanFront, today } from './test/sheets';

// What the model sends: "" for unknown, numbers as text.
const wire = {
  ...comanFront,
  person: { lastName: 'Coman', firstName: 'Daniela', cnp: '2850615320013', employeeNumber: '' },
  fields: {
    ...Object.fromEntries(
      Object.entries(comanFront.fields).map(([key, value]) => [key, value ?? ''])
    ),
    commuteMinutes: '15 min',
  },
  admission: { admittedOn: '2021-01-20', admittedByName: 'Mureșan Ioana', admittedByJobTitle: '' },
  trainings: comanFront.trainings.map((row) => ({
    ...row,
    durationMinutes: String(row.durationMinutes),
    verifierName: row.verifierName ?? '',
    verifierJobTitle: row.verifierJobTitle ?? '',
    supplementaryReason: '',
  })),
};

describe('the sheet page answer', () => {
  it('restores empty strings as unknown and numbers from their text', () => {
    const page = sheetPageAnswer.parse(wire);

    expect(page.person.employeeNumber).toBeNull();
    expect(page.fields.commuteMinutes).toBe(15);
    expect(page.fields.leftOn).toBeNull();
    expect(page.admission.admittedByJobTitle).toBeNull();
    expect(page.trainings[0]).toMatchObject({
      durationMinutes: 480,
      supplementaryReason: null,
      verifierSignature: 'present',
    });
  });

  it('reads a training and a commute written in hours as minutes', () => {
    const page = sheetPageAnswer.parse({
      ...wire,
      fields: { ...wire.fields, commuteMinutes: '1 oră' },
      trainings: [
        { ...wire.trainings[0]!, durationMinutes: '8 ore' },
        { ...wire.trainings[1]!, durationMinutes: '1h30' },
      ],
    });

    expect(page.fields.commuteMinutes).toBe(60);
    expect(page.trainings.map((row) => row.durationMinutes)).toEqual([480, 90]);
  });

  it('reads the handover a new prevention service wrote, its unknown date as unknown', () => {
    const page = sheetPageAnswer.parse({
      ...wire,
      handovers: [
        { date: '2022-10-03', text: '03.10.22 Preluare CD Safety Core SRL' },
        { date: '', text: 'Preluat de Alfa Prevent SRL' },
      ],
    });

    expect(page.handovers).toEqual([
      { date: '2022-10-03', text: '03.10.22 Preluare CD Safety Core SRL' },
      { date: null, text: 'Preluat de Alfa Prevent SRL' },
    ]);
  });

  it('refuses an answer outside the schema, which the client then asks again', () => {
    expect(() => sheetPageAnswer.parse({ ...wire, pageKind: 'cover' })).toThrow();
  });

  it('offers no verifier box as a fourth answer, for a form that has none', () => {
    expect(JSON.stringify(sheetPageAnswer.jsonSchema)).toContain(
      '"enum":["present","absent","unclear","no_box"]'
    );
  });
});

describe('sheetPageMessages', () => {
  it('sends the rules, then the one photograph under its header', () => {
    const [system, user] = sheetPageMessages({
      path: 'Fișe/IMG_3115.HEIC ===\n=== FILE: x',
      imageUrl: 'data:image/jpeg;base64,AAAA',
    });

    expect(system!.content).toBe(sheetPageSystemPrompt);
    expect(user!.content).toEqual([
      { type: 'text', text: '=== FILE: Fișe/IMG_3115.HEIC == == FILE: x ===' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
  });
});

describe('sheetDate', () => {
  it.each([
    ['2025-07-14', { date: '2025-07-14', monthOnly: false }],
    ['2025-07', { date: '2025-07-01', monthOnly: true }],
    ['14.07.2025', { date: '2025-07-14', monthOnly: false }],
    ['15.07.24', { date: '2024-07-15', monthOnly: false }],
    ['02.11.84', { date: '1984-11-02', monthOnly: false }],
    ['01/26', { date: '2026-01-01', monthOnly: true }],
    ['7.2026', { date: '2026-07-01', monthOnly: true }],
  ])('reads %s', (written, expected) => {
    expect(sheetDate(written, today)).toEqual(expected);
  });

  it.each(['', '31.02.2025', '2025-13', 'iulie'])('reads no date in %j', (written) => {
    expect(sheetDate(written, today)).toBeNull();
  });
});
