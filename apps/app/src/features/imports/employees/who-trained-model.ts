import {
  type AnsweredPerson,
  type AnswerPeriod,
  type AnswerPeriods,
  type AnswerRole,
  answerRoles,
  answerSplit,
  hasAnswer,
  type TrainingDomain,
  trainingDomains,
  type WhoTrainedAnswer,
} from '@ssm-usor/contracts';

import { foldText } from '../review-model';
import {
  answerOf,
  type Changes,
  handoverOf,
  type Person,
  personIncluded,
  positionOf,
  resolveField,
  type ReviewContext,
  rowValues,
  type SheetRow,
  trainingsByDomain,
  withPersonChange,
} from './employee-review-model';

type Context = Pick<ReviewContext, 'proposal' | 'changes'>;

// The printed form's words, apart from the signature slots' Instructor and Verificator.
export const roleLabels: Record<AnswerRole, string> = {
  trainer: 'A instruit',
  verifier: 'A verificat',
};

export const questionTitle = (domain: TrainingDomain) =>
  domain === 'ssm' ? 'Cine a instruit și cine a verificat?' : 'Cine a instruit?';

export const whoTrainedId = (domain: TrainingDomain) => `who-trained-${domain}`;

export const personText = (person: AnsweredPerson) =>
  person.jobTitle ? `${person.name}, ${person.jobTitle}` : person.name;

const readName = (row: SheetRow, field: 'trainerName' | 'verifierName') => {
  const name = (row.fromThemes as readonly string[]).includes(field) ? null : row[field];
  return name !== null && name.trim() !== '' ? name : null;
};

/** The dated periodic rows the question names: those whose sheet leaves a role it asks unnamed. */
export function questionRows(context: Context, personId: string, domain: TrainingDomain) {
  const own = trainingsByDomain(context, personId).find((each) => each.domain === domain);
  return (own?.periodic ?? []).filter(
    ({ row }) =>
      rowValues(context.changes, row).heldOn !== null &&
      answerRoles(domain).some(
        (role) => readName(row, role === 'trainer' ? 'trainerName' : 'verifierName') === null
      )
  );
}

export const asksWhoTrained = (context: Context, personId: string, domain: TrainingDomain) =>
  questionRows(context, personId, domain).length > 0;

export const unansweredDomains = (context: Context, personId: string) =>
  trainingDomains.filter(
    (domain) =>
      asksWhoTrained(context, personId, domain) &&
      !hasAnswer(domain, answerOf(context.changes, personId, domain))
  );

export function whoTrainedState(context: ReviewContext) {
  const asked = context.proposal.people.filter(
    (person) =>
      personIncluded(context, person) &&
      trainingDomains.some((domain) => asksWhoTrained(context, person.id, domain))
  );
  const unanswered = asked.filter((person) => unansweredDomains(context, person.id).length > 0);
  return { asked: asked.length, unanswered };
}

export const splitOf = (context: Context, personId: string, domain: TrainingDomain) =>
  answerSplit(handoverOf(context, personId), answerOf(context.changes, personId, domain));

export function withAnswer(
  changes: Changes,
  personId: string,
  domain: TrainingDomain,
  answer: WhoTrainedAnswer | undefined
): Changes {
  return withPersonChange(changes, personId, (current) => {
    const whoTrained = { ...current.whoTrained };
    const kept = answer && (answer.trainer || answer.verifier || answer.splitOn);
    if (kept) whoTrained[domain] = answer;
    else delete whoTrained[domain];
    return {
      ...current,
      whoTrained: Object.keys(whoTrained).length > 0 ? whoTrained : undefined,
    };
  });
}

// A copied answer the member changes is no longer the copy.
export function answered(
  answer: WhoTrainedAnswer | undefined,
  role: AnswerRole,
  period: AnswerPeriod,
  person: AnsweredPerson | null
): WhoTrainedAnswer {
  const periods: AnswerPeriods = { ...answer?.[role] };
  if (person) periods[period] = person;
  else delete periods[period];
  const next: WhoTrainedAnswer = { ...answer };
  if (periods.before || periods.from) next[role] = periods;
  else delete next[role];
  delete next.copiedFrom;
  return next;
}

export type CopyCandidate = { person: Person; samePost: boolean };

const postKey = (context: Context, person: Person) => {
  const position = positionOf(context, person);
  if (position) return `position:${position}`;
  const title = resolveField(context, person, 'jobTitle').value;
  return title === null ? null : `title:${foldText(String(title))}`;
};

// Those who have an answer of their own are listed apart: a copy never changes them.
export function copyCandidates(context: Context, person: Person, domain: TrainingDomain) {
  const post = postKey(context, person);
  const others = context.proposal.people.filter(
    (other) =>
      other.id !== person.id &&
      personIncluded(context, other) &&
      asksWhoTrained(context, other.id, domain)
  );
  const open: CopyCandidate[] = others
    .filter((other) => !hasAnswer(domain, answerOf(context.changes, other.id, domain)))
    .map((other) => ({
      person: other,
      samePost: post !== null && postKey(context, other) === post,
    }))
    .sort((a, b) => Number(b.samePost) - Number(a.samePost));
  const answeredOnes = others.filter((other) =>
    hasAnswer(domain, answerOf(context.changes, other.id, domain))
  );
  return { open, answered: answeredOnes };
}

// A person without a handover of their own takes the split date with the answer.
export function withAnswerCopied(
  context: Context,
  from: Person,
  domain: TrainingDomain,
  targetIds: readonly string[]
): Changes {
  const source = answerOf(context.changes, from.id, domain);
  if (!hasAnswer(domain, source)) return context.changes;
  const split = splitOf(context, from.id, domain);
  let changes = context.changes;
  for (const id of targetIds) {
    if (id === from.id || hasAnswer(domain, answerOf(changes, id, domain))) continue;
    const own = handoverOf(context, id);
    changes = withAnswer(changes, id, domain, {
      ...(source!.trainer ? { trainer: source!.trainer } : {}),
      ...(source!.verifier ? { verifier: source!.verifier } : {}),
      ...(own === null && split !== null ? { splitOn: split } : {}),
      copiedFrom: source!.copiedFrom ?? from.id,
    });
  }
  return changes;
}

export const copiesOf = (changes: Changes, sourceId: string, domain: TrainingDomain) =>
  Object.values(changes.people).filter(
    (change) => change.whoTrained?.[domain]?.copiedFrom === sourceId
  ).length;

export type SignerOption = {
  key: string;
  name: string;
  jobTitle: string | null;
  // The pages of the import that name the person.
  sheets: number;
};

export type SignerGroup = { label: string; options: SignerOption[] };

type Named = { name: string | null; jobTitle: string | null };

const namesOfRow = (row: SheetRow): Named[] => [
  { name: readName(row, 'trainerName'), jobTitle: row.trainerJobTitle },
  { name: readName(row, 'verifierName'), jobTitle: row.verifierJobTitle },
  {
    name: row.admission?.admittedByName ?? null,
    jobTitle: row.admission?.admittedByJobTitle ?? null,
  },
];

export function sheetCounts(context: Pick<ReviewContext, 'proposal'>) {
  const counts = new Map<string, number>();
  for (const page of context.proposal.pages) {
    const names = new Set(
      page.rows.flatMap((row) =>
        namesOfRow(row).flatMap(({ name }) => (name ? [foldText(name)] : []))
      )
    );
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

export function hiringNames(context: Context, personId: string, domain: TrainingDomain): Named[] {
  const own = trainingsByDomain(context, personId).find((each) => each.domain === domain);
  return (own?.hiring.rows ?? []).flatMap(({ row }) => namesOfRow(row));
}

// A verifier is a name and a function together, so one without a function is not offered for it.
export function signerGroups(input: {
  role: AnswerRole;
  sheetNames: Named[];
  responsible: Named[];
  members: Named[];
  counts: ReadonlyMap<string, number>;
}): SignerGroup[] {
  const seen = new Set<string>();
  const group = (key: string, label: string, people: Named[]): SignerGroup => ({
    label,
    options: people.flatMap(({ name, jobTitle }, index) => {
      const trimmed = name?.trim() ?? '';
      const title = jobTitle?.trim() || null;
      const folded = foldText(trimmed);
      if (trimmed === '' || seen.has(folded)) return [];
      if (input.role === 'verifier' && title === null) return [];
      seen.add(folded);
      return [
        {
          key: `${key}-${index}`,
          name: trimmed,
          jobTitle: title,
          sheets: input.counts.get(folded) ?? 0,
        },
      ];
    }),
  });
  return [
    group('sheet', 'Citite de pe fișe, la instruirile de la angajare', input.sheetNames),
    group('client', 'Responsabilii clientului', input.responsible),
    group('organization', 'Din organizația ta', input.members),
  ].filter((each) => each.options.length > 0);
}

export const samePerson = (
  a: AnsweredPerson | null | undefined,
  b: AnsweredPerson | null | undefined
) =>
  !!a &&
  !!b &&
  foldText(a.name) === foldText(b.name) &&
  foldText(a.jobTitle ?? '') === foldText(b.jobTitle ?? '');
