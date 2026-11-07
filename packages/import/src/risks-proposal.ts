import { foldText, riskLevel } from '@ssm-usor/contracts';

import { foldName } from './match';
import {
  compareRiskSheets,
  type LibraryEvaluation,
  type RiskLibraryMatch,
  type RiskLibraryStatus,
} from './risks-library';
import {
  factorComplete,
  namesOneOf,
  type ReadFactor,
  type ReadRisks,
  type ReadSheet,
  type UnmatchedPlanRow,
} from './risks-read';

export type RiskLibraryChoice = 'add' | 'use_existing' | 'add_new' | 'skip';
export type ExistingFactorsChoice = 'append' | 'replace' | 'keep';
export type LibraryNameSource = 'work' | 'workplace' | 'post' | 'heading' | 'kind';

export interface ProposedRiskFactor extends ReadFactor {
  // Ticked: written to the client and the library.
  included: boolean;
  // The grid's level for the printed classes; null while a class is missing.
  level: number | null;
}

export interface ProposedSheetPost {
  // As the client proposal names it.
  name: string;
  // The factors the post's sheet already has; with any, the specialist chooses what happens.
  existingFactors: number;
  choice: ExistingFactorsChoice | null;
}

export interface ProposedRiskSheet extends Omit<ReadSheet, 'posts' | 'workName' | 'factors'> {
  posts: ProposedSheetPost[];
  // Absent from a proposal stored before the reading suggested names. The model's name for the
  // work and the workplace the heading names, null when there is none or it names the client or
  // one of its people.
  workName?: string | null;
  workplace?: string | null;
  // A post's sheet whose heading names none of the proposal's posts: the specialist picks one, or
  // leaves it to the library alone.
  undecided: boolean;
  // A client-level sheet's evaluation already on the client.
  existing: { factors: number; choice: ExistingFactorsChoice | null } | null;
  // Proposed for a new library entry, editable.
  libraryName: string;
  // What the proposed name was taken from: the model's name for the work, the heading's workplace,
  // the sheet's one post, its heading, or its kind. Absent
  // from a proposal read before 2026-11-07, as is `takenName`.
  nameFrom?: LibraryNameSource;
  // The name an entry of the library already held, so the client's name was added to it.
  takenName?: string | null;
  // Null for a sheet identical to an earlier one of the pack, which it follows in the library.
  status: RiskLibraryStatus | null;
  match: RiskLibraryMatch | null;
  choice: RiskLibraryChoice | null;
  sameAs: string[];
  copyOf: string | null;
  factors: ProposedRiskFactor[];
}

// A proposal stored before plan rows were placed on sheets has neither `sheet` nor `factor`.
export interface ProposedPlanRow extends Omit<UnmatchedPlanRow, 'sheet' | 'factor'> {
  sheet?: string | null;
  // Unticked: written only when the specialist adds it to its sheet.
  factor?: ProposedRiskFactor | null;
}

export interface RisksProposal {
  sheets: ProposedRiskSheet[];
  unplacedRows: ReadRisks['unplacedRows'];
  unmatchedPlanRows: ProposedPlanRow[];
  unmatchedMeasureRows: ReadRisks['unmatchedMeasureRows'];
}

export interface ExistingEvaluations {
  // By the proposal's post name.
  posts?: Readonly<Record<string, number>>;
  sensitiveGroups?: number;
  // By the evaluation's name.
  other?: Readonly<Record<string, number>>;
}

export interface ProposeRisksInput {
  read: ReadRisks;
  posts: readonly string[];
  library: readonly LibraryEvaluation[];
  takenNames: readonly string[];
  client: { name: string };
  // The client's and provider's people, whose names never go into a library entry's name.
  people?: readonly string[];
  existing?: ExistingEvaluations;
  thresholds?: { share: number; description: number };
}

const upperCase = (text: string) => !/\p{Ll}/u.test(text) && /\p{Lu}{2}/u.test(text);

export function entryName(written: string) {
  const tidy = written
    .replace(/\s+([,;.])/gu, '$1')
    .replace(/^[\s(]+|[\s).:;,]+$/gu, '')
    .replace(/\s+/gu, ' ');
  if (!upperCase(tidy)) return tidy;
  const lower = tidy.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// The database's limits on an entry's and a client-level evaluation's name.
export const nameLength = { min: 2, max: 160 };

const fits = (name: string) => name.length >= nameLength.min;

export function evaluationName(written: string, heading: string) {
  const name = [entryName(written), entryName(heading)].find(fits) ?? 'Evaluare de risc';
  return name.slice(0, nameLength.max).trim();
}

const workplaceLabel = /(?<!\p{L})loc(?:ul)?\s+de\s+munc\p{L}?\s*:\s*/iu;
const postLabel = /(?<!\p{L})post(?:ul)?\s+de\s+lucru(?!\p{L})/iu;

// "… PENTRU LOCUL DE MUNCĂ : DEPOZIT ,RAMPĂ , POSTUL DE LUCRU : MANIPULANT" names the workplace
// "Depozit, rampă".
export function workplaceOf(heading: string) {
  const label = workplaceLabel.exec(heading);
  if (!label) return null;
  const rest = heading.slice(label.index + label[0].length);
  const end = postLabel.exec(rest);
  const name = entryName((end ? rest.slice(0, end.index) : rest).replace(/\s*([,;])\s*/gu, '$1 '));
  return fits(name) ? name : null;
}

const namesClient = (name: string, client: string) => {
  const folded = foldName(client);
  return folded.length >= 3 && ` ${foldName(name)} `.includes(` ${folded} `);
};

interface Owners {
  client: string;
  people: readonly string[];
}

const usableName = (written: string | null | undefined, owners: Owners) => {
  const name = written && entryName(written).slice(0, nameLength.max).trim();
  return name && fits(name) && !namesClient(name, owners.client) && !namesOneOf(name, owners.people)
    ? name
    : null;
};

const suggestedNames = (sheet: ReadSheet, owners: Owners) => ({
  workName: usableName(sheet.workName, owners),
  workplace: usableName(workplaceOf(sheet.heading), owners),
});

// A library entry is reused at other employers, so it is named by its work before its post.
function libraryNameOf(
  sheet: ReadSheet,
  posts: readonly string[],
  owners: Owners
): { name: string; from: LibraryNameSource } {
  if (sheet.kind === 'sensitive_groups') return { name: 'Grupuri sensibile', from: 'kind' };
  const heading = { name: evaluationName(sheet.name, sheet.heading), from: 'heading' } as const;
  if (sheet.kind !== 'job_position') return heading;
  const { workName, workplace } = suggestedNames(sheet, owners);
  const post = posts.length === 1 ? usableName(posts[0], owners) : null;
  if (workName) return { name: workName, from: 'work' };
  if (workplace) return { name: workplace, from: 'workplace' };
  return post ? { name: post, from: 'post' } : heading;
}

const choiceFor = (existing: number) => (existing > 0 ? ('keep' as const) : null);

export function proposeRisks(input: ProposeRisksInput): RisksProposal {
  const owners: Owners = { client: input.client.name, people: input.people ?? [] };
  const postByFold = new Map(input.posts.map((post) => [foldText(post), post]));
  const factorsOf = (sheet: ReadSheet): ProposedRiskFactor[] =>
    sheet.factors.map((factor) => ({
      ...factor,
      included: factorComplete(factor),
      level:
        factor.gravityClass !== null && factor.probabilityClass !== null
          ? riskLevel(factor.gravityClass, factor.probabilityClass)
          : null,
    }));
  const prepared = input.read.sheets.map((sheet) => {
    const posts =
      sheet.kind === 'job_position'
        ? [...new Set(sheet.posts.flatMap((post) => postByFold.get(foldText(post)) ?? []))]
        : [];
    const { name, from } = libraryNameOf(sheet, posts, owners);
    return { sheet, posts, factors: factorsOf(sheet), libraryName: name, nameFrom: from };
  });
  const postsFirst = [...prepared].sort(
    (a, b) => Number(a.sheet.kind !== 'job_position') - Number(b.sheet.kind !== 'job_position')
  );
  const compared = compareRiskSheets({
    // A post's sheet is the original of a client-level copy wherever the pack puts it, since a
    // client-level sheet stays out of the library by default and its copies follow it.
    sheets: postsFirst.map(({ sheet, factors, libraryName }) => ({
      key: sheet.key,
      name: libraryName,
      factors,
    })),
    library: input.library,
    takenNames: input.takenNames,
    clientName: input.client.name,
    thresholds: input.thresholds,
  });
  const byKey = new Map(compared.map((item) => [item.key, item]));
  const copyOf = new Map(compared.flatMap((item) => item.sameAs.map((key) => [key, item.key])));

  const sheets = prepared.map(
    ({ sheet, posts, factors, libraryName, nameFrom }): ProposedRiskSheet => {
      const clientLevel = sheet.kind !== 'job_position';
      const existingCount =
        sheet.kind === 'sensitive_groups'
          ? (input.existing?.sensitiveGroups ?? 0)
          : sheet.kind === 'other'
            ? (Object.entries(input.existing?.other ?? {}).find(
                ([name]) => foldText(name) === foldText(libraryName)
              )?.[1] ?? 0)
            : 0;
      const item = byKey.get(sheet.key);
      const status = item?.status ?? null;
      let choice: RiskLibraryChoice | null = null;
      if (item) {
        if (item.status === 'identical') choice = 'use_existing';
        else if (factors.length === 0 || clientLevel) choice = 'skip';
        else if (item.status === 'new') choice = 'add';
        else choice = item.match!.onlyInPack.length > 0 ? 'add_new' : 'use_existing';
      }
      return {
        key: sheet.key,
        file: sheet.file,
        heading: sheet.heading,
        kind: sheet.kind,
        name: sheet.name,
        rows: sheet.rows,
        meansOfProduction: sheet.meansOfProduction,
        workEnvironment: sheet.workEnvironment,
        exposure: sheet.exposure,
        flags: sheet.flags,
        posts: posts.map((name) => {
          const count = input.existing?.posts?.[name] ?? 0;
          return { name, existingFactors: count, choice: choiceFor(count) };
        }),
        ...suggestedNames(sheet, owners),
        undecided: sheet.kind === 'job_position' && posts.length === 0,
        existing: clientLevel ? { factors: existingCount, choice: choiceFor(existingCount) } : null,
        libraryName: item?.name ?? libraryName,
        nameFrom,
        takenName:
          item && item.status !== 'identical' && item.name !== libraryName ? libraryName : null,
        status,
        match: item?.match ?? null,
        choice,
        sameAs: item?.sameAs ?? [],
        copyOf: copyOf.get(sheet.key) ?? null,
        factors,
      };
    }
  );
  return {
    sheets,
    unplacedRows: input.read.unplacedRows,
    unmatchedPlanRows: input.read.unmatchedPlanRows.map((row) => ({
      ...row,
      factor: row.factor && { ...row.factor, included: false, level: null },
    })),
    unmatchedMeasureRows: input.read.unmatchedMeasureRows,
  };
}
