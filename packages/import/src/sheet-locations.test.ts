import { describe, expect, it } from 'vitest';

import {
  locatingAnswer,
  locatingRequest,
  type LocatingTarget,
  locatingTargets,
  sheetLocations,
} from './sheet-locations';
import { page, row } from './test/sheets';

const front = page({
  pageKind: 'ssm_sheet_front',
  person: { lastName: 'Coman', firstName: 'Daniela', cnp: '2850615320013' },
  fields: { birthDate: '1985-06-15', jobTitle: 'Patiser', commuteMinutes: 15 },
  admission: { admittedOn: '2021-01-20', admittedByJobTitle: 'Administrator' },
  trainings: [
    row({ phase: 'introductory_general', heldOn: '2021-01-18', durationMinutes: 480 }),
    row({
      domain: 'su',
      annualTest: true,
      heldOn: null,
      durationMinutes: null,
      trainerName: null,
      material: null,
    }),
  ],
  handovers: [{ date: '2022-10-03', text: '03.10.22 Preluare CD Safety Core SRL' }],
});

describe('locatingTargets', () => {
  it('names each value the page wrote, rows and handovers included, and nothing it left empty', () => {
    const targets = locatingTargets(front);

    expect(targets.map((target) => target.id)).toEqual([
      'person.name',
      'person.cnp',
      'fields.birthDate',
      'fields.jobTitle',
      'fields.commuteMinutes',
      'admission.admittedOn',
      'trainings[0]',
      'trainings[0].heldOn',
      'trainings[0].durationMinutes',
      'trainings[0].trainerName',
      'trainings[0].material',
      'trainings[1]',
      'handovers[0]',
    ]);
    expect(targets).toContainEqual({
      id: 'person.name',
      label: 'numele și prenumele persoanei',
      value: 'Coman Daniela',
    });
    expect(targets).toContainEqual({
      id: 'fields.commuteMinutes',
      label: 'durata deplasării (minute)',
      value: '15',
    });
    expect(targets).toContainEqual({
      id: 'trainings[0]',
      label: 'instruirea 1 (SSM introductory_general): tot rândul / blocul',
      value: '2021-01-18 · Riscuri la cuptor și malaxor',
      kind: 'row',
    });
    expect(targets).toContainEqual({
      id: 'trainings[1]',
      label: 'instruirea 2 (SU periodic + testare anuală): tot rândul / blocul',
      value: '',
      kind: 'row',
    });
    expect(targets).toContainEqual({
      id: 'handovers[0]',
      label: 'linia de preluare',
      value: '03.10.22 Preluare CD Safety Core SRL',
    });
  });

  it('names a page that wrote nothing with no target', () => {
    expect(locatingTargets(page({ pageKind: 'other' }))).toEqual([]);
  });
});

describe('locatingRequest', () => {
  it('sends the image and the targets, and nothing about the file', () => {
    const targets = locatingTargets(front).slice(0, 2);
    const request = locatingRequest('data:image/jpeg;base64,AAAA', targets);

    expect(request).toMatchObject({ model: 'gemini-3.1-flash-lite', answer: locatingAnswer });
    expect(request).not.toHaveProperty('reasoningEffort');
    expect(request.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        {
          type: 'text',
          text: 'Targets:\n- id: person.name; numele și prenumele persoanei; value: "Coman Daniela"\n- id: person.cnp; CNP; value: "2850615320013"',
        },
      ],
    });
  });
});

describe('sheetLocations', () => {
  const targets: LocatingTarget[] = locatingTargets(front);
  const located = (locations: { id: string; found: boolean; box_2d: number[] }[]) =>
    sheetLocations(locatingAnswer.parse({ locations }), targets);

  it('turns found boxes into the targets’ order, in thousandths', () => {
    expect(
      located([
        { id: 'trainings[0]', found: true, box_2d: [400, 50, 520, 950] },
        { id: 'person.name', found: true, box_2d: [100, 200, 130, 600] },
      ])
    ).toEqual([
      { target: 'person.name', top: 100, left: 200, bottom: 130, right: 600 },
      { target: 'trainings[0]', top: 400, left: 50, bottom: 520, right: 950 },
    ]);
  });

  it('reads an id the model echoed with more of its line, and drops unknown ids', () => {
    expect(
      located([
        { id: 'trainings[0] (kind: row)', found: true, box_2d: [400, 50, 520, 950] },
        { id: 'id: person.cnp', found: true, box_2d: [140, 200, 160, 500] },
        { id: 'trainings[7].heldOn', found: true, box_2d: [10, 10, 50, 50] },
        { id: 'admission.admittedByName', found: true, box_2d: [10, 10, 50, 50] },
      ]).map((location) => location.target)
    ).toEqual(['person.cnp', 'trainings[0]']);
  });

  it('orders inverted corners, clamps to the image and drops degenerate boxes', () => {
    expect(
      located([
        { id: 'person.name', found: true, box_2d: [130, 600, 100, 200] },
        { id: 'person.cnp', found: true, box_2d: [-20, 980.4, 40, 1200] },
        { id: 'fields.birthDate', found: true, box_2d: [300, 300, 302, 500] },
        { id: 'fields.jobTitle', found: true, box_2d: [300, 300, 400, 300] },
        { id: 'fields.commuteMinutes', found: true, box_2d: [1100, 100, 1200, 200] },
        { id: 'admission.admittedOn', found: true, box_2d: [1, 2, 3] },
      ])
    ).toEqual([
      { target: 'person.name', top: 100, left: 200, bottom: 130, right: 600 },
      { target: 'person.cnp', top: 0, left: 980, bottom: 40, right: 1000 },
    ]);
  });

  it('leaves out what was not found and keeps the first box of a repeated id', () => {
    expect(
      located([
        { id: 'person.name', found: false, box_2d: [0, 0, 0, 0] },
        { id: 'person.cnp', found: false, box_2d: [100, 100, 200, 200] },
        { id: 'handovers[0]', found: true, box_2d: [800, 100, 830, 700] },
        { id: 'handovers[0]', found: true, box_2d: [10, 10, 50, 50] },
      ])
    ).toEqual([{ target: 'handovers[0]', top: 800, left: 100, bottom: 830, right: 700 }]);
  });

  it('refuses an answer outside the schema', () => {
    expect(() => locatingAnswer.parse({ boxes: [] })).toThrow();
    expect(() =>
      locatingAnswer.parse({ locations: [{ id: 'person.name', box_2d: [1, 2, 3, 4] }] })
    ).toThrow();
  });
});
