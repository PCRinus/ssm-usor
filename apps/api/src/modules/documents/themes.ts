import { type StaffCategory, trainingMonths } from '@ssm-usor/contracts';

import { listed } from '../../lib/romanian';

// Both lists are held to their templates by scripts/lib/theme-chapters.test.ts.
export const ownInstructionsChapterStarts = [
  1, 10, 45, 47, 57, 64, 96, 160, 180, 195, 236, 256,
] as const;
export const ownInstructionsArticleCount = 290;

export const generalTrainingChapterStarts = [
  1, 7, 14, 16, 28, 81, 97, 109, 121, 152, 211, 236, 268, 278, 291, 300, 325,
] as const;
export const generalTrainingArticleCount = 325;

export const monthNames = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
] as const;

export type ArticleRange = { from: number; to: number };

export function dealChapters(sessions: number): ArticleRange[] {
  const chapters = ownInstructionsChapterStarts.length;
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > chapters) {
    throw new RangeError(`Between 1 and ${chapters} training sessions, not ${sessions}.`);
  }
  const size = Math.floor(chapters / sessions);
  const larger = chapters % sessions;
  const ranges: ArticleRange[] = [];
  let first = 0;
  for (let session = 0; session < sessions; session += 1) {
    const next = first + size + (session < larger ? 1 : 0);
    ranges.push({
      from: ownInstructionsChapterStarts[first]!,
      to: next < chapters ? ownInstructionsChapterStarts[next]! - 1 : ownInstructionsArticleCount,
    });
    first = next;
  }
  return ranges;
}

export type CitedModule = { title: string; articleCount: number };

const articles = (from: number, to: number) => `Art.\u00a0${from}\u00a0–\u00a0${to}`;

// A file without a numbered list counts no articles, and "Art. 1 – 0" would cite nothing.
export const citation = (module: CitedModule) =>
  module.articleCount > 0
    ? `I.P.S.S.M. ${module.title}, ${articles(1, module.articleCount)}`
    : `I.P.S.S.M. ${module.title}`;

export type TrainingSession = { month: string; content: string; duration: string };

export function trainingSessions({
  firstMonth,
  intervalMonths,
  periodicTrainingMinutes,
  modules,
}: {
  firstMonth: number;
  intervalMonths: number;
  periodicTrainingMinutes: number;
  modules: readonly CitedModule[];
}): TrainingSession[] {
  const months = trainingMonths(firstMonth, intervalMonths);
  const ranges = dealChapters(months.length);
  return months.map((month, index) => {
    const last = index === months.length - 1;
    const range = ranges[index]!;
    const parts = [
      `I.P.S.S.M. ${articles(range.from, range.to)}`,
      ...modules.map(citation),
      ...(last ? ['Testare.'] : []),
    ];
    return {
      month: monthNames[month - 1]!.toLocaleUpperCase('ro'),
      content: parts.join('; '),
      duration: `${periodicTrainingMinutes} min`,
    };
  });
}

export type TrainerNames = {
  /** At least one. */
  workplaceManagers: readonly string[];
  provider: string;
  specialist: string;
};

// A workplace manager cannot train themself, so the specialist trains the other posts.
export function trainerOf(staffCategory: StaffCategory, names: TrainerNames) {
  if (staffCategory !== 'execution') return `${names.provider} – ${names.specialist}`;
  return names.workplaceManagers.length === 1
    ? `${names.workplaceManagers[0]} – conducătorul locului\u00a0de\u00a0muncă`
    : `${listed(names.workplaceManagers)} – conducătorii locurilor\u00a0de\u00a0muncă`;
}

export function themeIntervalLabel(months: number | null) {
  if (months === null) return '—';
  return months === 1 ? '1 LUNĂ' : `${months} LUNI`;
}

export type OwnInstructionsRevision = {
  revisionId: string;
  revisionNumber: number;
  /** In the revision's annex order. */
  annexes: { moduleId: string; versionId: string; title: string; articleCount: number }[];
};

export type ThemesContext = {
  /** Never printed: what makes the themes out of date when the own instructions change. */
  ownInstructionsRevision: { id: string; number: number; versionIds: string[] };
  annexTitles: string;
  positions: {
    name: string;
    trainer: string;
    modules: { citation: string }[];
    intervalLabel: string;
    sessions: TrainingSession[];
  }[];
};

// A module the revision does not annex waits for the own instructions to be generated again.
export function trainingThemes({
  ownInstructions,
  positions,
  firstMonth,
  periodicTrainingMinutes,
  names,
}: {
  ownInstructions: OwnInstructionsRevision;
  positions: readonly {
    name: string;
    staffCategory: StaffCategory;
    /** Null for a category the client does not train. */
    intervalMonths: number | null;
    moduleIds: readonly string[];
  }[];
  firstMonth: number;
  periodicTrainingMinutes: number;
  names: TrainerNames;
}): ThemesContext {
  const annexes = ownInstructions.annexes.map((annex) => ({
    ...annex,
    title: annex.title.trim(),
  }));
  return {
    ownInstructionsRevision: {
      id: ownInstructions.revisionId,
      number: ownInstructions.revisionNumber,
      // A draft generated again keeps its id; new module versions still date the themes.
      versionIds: ownInstructions.annexes.map((annex) => annex.versionId),
    },
    annexTitles:
      annexes.length === 0 ? '—' : annexes.map((annex) => `I.P.S.S.M. ${annex.title}`).join('; '),
    positions: positions.map((position) => {
      const modules = annexes.filter((annex) => position.moduleIds.includes(annex.moduleId));
      return {
        name: position.name.trim().toLocaleUpperCase('ro'),
        trainer: trainerOf(position.staffCategory, names),
        modules: modules.map((module) => ({ citation: citation(module) })),
        intervalLabel: themeIntervalLabel(position.intervalMonths),
        sessions:
          position.intervalMonths === null
            ? []
            : trainingSessions({
                firstMonth,
                intervalMonths: position.intervalMonths,
                periodicTrainingMinutes,
                modules,
              }),
      };
    }),
  };
}
