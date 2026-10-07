import { describe, expect, it } from 'vitest';

import {
  dealChapters,
  themeIntervalLabel,
  trainerOf,
  trainingSessions,
  trainingThemes,
} from './themes';

const ranges = (sessions: number) =>
  dealChapters(sessions).map(({ from, to }) => `Art. ${from} – ${to}`);

describe('dealing the chapters of the common part', () => {
  it('gives one session everything', () => {
    expect(ranges(1)).toEqual(['Art. 1 – 290']);
  });

  it('halves them for two sessions', () => {
    expect(ranges(2)).toEqual(['Art. 1 – 95', 'Art. 96 – 290']);
  });

  it('gives four sessions three chapters each', () => {
    expect(ranges(4)).toEqual(['Art. 1 – 46', 'Art. 47 – 95', 'Art. 96 – 194', 'Art. 195 – 290']);
  });

  it('puts the larger groups first', () => {
    expect(ranges(5)).toEqual([
      'Art. 1 – 46',
      'Art. 47 – 95',
      'Art. 96 – 179',
      'Art. 180 – 235',
      'Art. 236 – 290',
    ]);
  });

  it('gives twelve sessions one chapter each', () => {
    expect(ranges(12)).toEqual([
      'Art. 1 – 9',
      'Art. 10 – 44',
      'Art. 45 – 46',
      'Art. 47 – 56',
      'Art. 57 – 63',
      'Art. 64 – 95',
      'Art. 96 – 159',
      'Art. 160 – 179',
      'Art. 180 – 194',
      'Art. 195 – 235',
      'Art. 236 – 255',
      'Art. 256 – 290',
    ]);
  });

  it('refuses a count of sessions no schedule gives', () => {
    expect(() => dealChapters(0)).toThrow(RangeError);
    expect(() => dealChapters(13)).toThrow(RangeError);
  });
});

describe('the periodic sessions of a post', () => {
  const modules = [
    { title: 'Title one', articleCount: 18 },
    { title: 'Title two', articleCount: 7 },
  ];

  it('cite a slice of the common part and every module whole, and test on the last', () => {
    expect(
      trainingSessions({ firstMonth: 2, intervalMonths: 3, periodicTrainingMinutes: 120, modules })
    ).toEqual([
      {
        month: 'FEBRUARIE',
        content:
          'I.P.S.S.M. Art.\u00a01\u00a0–\u00a046; I.P.S.S.M. Title one, Art.\u00a01\u00a0–\u00a018; I.P.S.S.M. Title two, Art.\u00a01\u00a0–\u00a07',
        duration: '120 min',
      },
      {
        month: 'MAI',
        content:
          'I.P.S.S.M. Art.\u00a047\u00a0–\u00a095; I.P.S.S.M. Title one, Art.\u00a01\u00a0–\u00a018; I.P.S.S.M. Title two, Art.\u00a01\u00a0–\u00a07',
        duration: '120 min',
      },
      {
        month: 'AUGUST',
        content:
          'I.P.S.S.M. Art.\u00a096\u00a0–\u00a0194; I.P.S.S.M. Title one, Art.\u00a01\u00a0–\u00a018; I.P.S.S.M. Title two, Art.\u00a01\u00a0–\u00a07',
        duration: '120 min',
      },
      {
        month: 'NOIEMBRIE',
        content:
          'I.P.S.S.M. Art.\u00a0195\u00a0–\u00a0290; I.P.S.S.M. Title one, Art.\u00a01\u00a0–\u00a018; I.P.S.S.M. Title two, Art.\u00a01\u00a0–\u00a07; Testare.',
        duration: '120 min',
      },
    ]);
  });

  it('cite the common part alone for a post without modules', () => {
    const sessions = trainingSessions({
      firstMonth: 7,
      intervalMonths: 12,
      periodicTrainingMinutes: 60,
      modules: [],
    });
    expect(sessions).toEqual([
      {
        month: 'IULIE',
        content: 'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0290; Testare.',
        duration: '60 min',
      },
    ]);
  });

  it('run in calendar order when the schedule wraps the year, and test in the last of them', () => {
    const sessions = trainingSessions({
      firstMonth: 11,
      intervalMonths: 6,
      periodicTrainingMinutes: 60,
      modules: [],
    });
    expect(sessions).toEqual([
      {
        month: 'MAI',
        content: 'I.P.S.S.M. Art.\u00a01\u00a0–\u00a095',
        duration: '60 min',
      },
      {
        month: 'NOIEMBRIE',
        content: 'I.P.S.S.M. Art.\u00a096\u00a0–\u00a0290; Testare.',
        duration: '60 min',
      },
    ]);
  });

  it('cite a module without numbered articles by its title', () => {
    const [session] = trainingSessions({
      firstMonth: 12,
      intervalMonths: 12,
      periodicTrainingMinutes: 60,
      modules: [{ title: 'Fără articole', articleCount: 0 }],
    });
    expect(session!.content).toBe(
      'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0290; I.P.S.S.M. Fără articole; Testare.'
    );
  });

  it('end in the test only once, in the last month', () => {
    const sessions = trainingSessions({
      firstMonth: 1,
      intervalMonths: 1,
      periodicTrainingMinutes: 90,
      modules,
    });
    expect(sessions).toHaveLength(12);
    expect(sessions.filter((session) => session.content.includes('Testare'))).toEqual([
      sessions[11],
    ]);
    expect(sessions[11]!.month).toBe('DECEMBRIE');
  });
});

describe('who trains a post', () => {
  const names = {
    workplaceManagers: ['Ion POP'],
    provider: 'S.C. SSM S.R.L.',
    specialist: 'Dan MARIN',
  };

  it('is the workplace manager for execution posts', () => {
    expect(trainerOf('execution', names)).toBe('Ion POP – conducătorul locului\u00a0de\u00a0muncă');
  });

  it('is every workplace manager for execution posts, where there are several', () => {
    expect(
      trainerOf('execution', { ...names, workplaceManagers: ['Steliana GAL', 'Lucrețiu ANDREI'] })
    ).toBe('Steliana GAL și Lucrețiu ANDREI – conducătorii locurilor\u00a0de\u00a0muncă');
  });

  it('is the provider and its specialist for technical-administrative posts', () => {
    expect(trainerOf('technical_administrative', names)).toBe('S.C. SSM S.R.L. – Dan MARIN');
  });
});

describe('the interval of a post', () => {
  it('prints in capitals, with the singular for one month', () => {
    expect(themeIntervalLabel(1)).toBe('1 LUNĂ');
    expect(themeIntervalLabel(3)).toBe('3 LUNI');
    expect(themeIntervalLabel(12)).toBe('12 LUNI');
    expect(themeIntervalLabel(null)).toBe('—');
  });
});

describe('the themes', () => {
  const ownInstructions = {
    revisionId: 'r1',
    revisionNumber: 1,
    annexes: [
      { moduleId: 'm-office', versionId: 'v-office', title: ' Birou ', articleCount: 12 },
      { moduleId: 'm-ladder', versionId: 'v-ladder', title: 'Scări', articleCount: 0 },
    ],
  };
  const names = {
    workplaceManagers: ['Ion POP'],
    provider: 'S.C. SSM S.R.L.',
    specialist: 'Dan MARIN',
  };

  it("cite a post's modules in the revision's order, an uncounted one by title, and none the revision does not annex", () => {
    const themes = trainingThemes({
      ownInstructions,
      positions: [
        {
          name: ' șofer ',
          staffCategory: 'execution',
          intervalMonths: 6,
          moduleIds: ['m-new', 'm-ladder', 'm-office'],
        },
      ],
      firstMonth: 7,
      periodicTrainingMinutes: 120,
      names,
    });
    expect(themes.annexTitles).toBe('I.P.S.S.M. Birou; I.P.S.S.M. Scări');
    expect(themes.ownInstructionsRevision).toEqual({
      id: 'r1',
      number: 1,
      versionIds: ['v-office', 'v-ladder'],
    });
    expect(themes.positions[0]).toMatchObject({
      name: 'ȘOFER',
      modules: [
        { citation: 'I.P.S.S.M. Birou, Art.\u00a01\u00a0–\u00a012' },
        { citation: 'I.P.S.S.M. Scări' },
      ],
      intervalLabel: '6 LUNI',
    });
  });

  it('print a dash for a revision that annexes nothing, and no sessions without an interval', () => {
    const themes = trainingThemes({
      ownInstructions: { ...ownInstructions, annexes: [] },
      positions: [
        {
          name: 'Contabil',
          staffCategory: 'technical_administrative',
          intervalMonths: null,
          moduleIds: [],
        },
      ],
      firstMonth: 2,
      periodicTrainingMinutes: 120,
      names,
    });
    expect(themes.annexTitles).toBe('—');
    expect(themes.positions[0]).toMatchObject({ intervalLabel: '—', sessions: [] });
  });
});
