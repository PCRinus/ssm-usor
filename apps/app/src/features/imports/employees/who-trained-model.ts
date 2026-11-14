import {
  type AnsweredPerson,
  type AnswerPeriods,
  type AnswerRole,
  answerRoles,
  type HandoverWindow,
  hasAnswer,
  liveAnswer,
  staleRoles,
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

export const liveOf = (context: Context, personId: string, domain: TrainingDomain) =>
  liveAnswer(handoverOf(context, personId), answerOf(context.changes, personId, domain));

export const staleOf = (context: Context, personId: string, domain: TrainingDomain) =>
  staleRoles(domain, handoverOf(context, personId), answerOf(context.changes, personId, domain));

export const unansweredDomains = (context: Context, personId: string) =>
  trainingDomains.filter(
    (domain) =>
      asksWhoTrained(context, personId, domain) &&
      !hasAnswer(domain, liveOf(context, personId, domain))
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

const windowOfRole = (answer: WhoTrainedAnswer | undefined): HandoverWindow | null => {
  const periods = answer?.trainer ?? answer?.verifier;
  if (!periods || periods.splitOn === undefined) return null;
  return { splitOn: periods.splitOn, previousOn: periods.previousOn ?? null };
};

/** The handovers a new choice is given under: the person's own, else those a copy brought. */
export function windowOf(context: Context, personId: string, domain: TrainingDomain) {
  const own = handoverOf(context, personId);
  const answer = answerOf(context.changes, personId, domain);
  if (own.splitOn !== null || !answer?.splitCopied) return own;
  return windowOfRole(answer) ?? own;
}

const sameWindow = (a: HandoverWindow, b: HandoverWindow) =>
  a.splitOn === b.splitOn && a.previousOn === b.previousOn;

export function withAnswer(
  changes: Changes,
  personId: string,
  domain: TrainingDomain,
  answer: WhoTrainedAnswer | undefined
): Changes {
  return withPersonChange(changes, personId, (current) => {
    const whoTrained = { ...current.whoTrained };
    if (answer && (answer.trainer || answer.verifier)) whoTrained[domain] = answer;
    else delete whoTrained[domain];
    return {
      ...current,
      whoTrained: Object.keys(whoTrained).length > 0 ? whoTrained : undefined,
    };
  });
}

/**
 * The answer with one role chosen again, whole, under the handovers it was chosen under. A copy the
 * member changes becomes their own answer.
 */
export function withRole(
  answer: WhoTrainedAnswer | undefined,
  role: AnswerRole,
  periods: Pick<AnswerPeriods, 'before' | 'from'>,
  window: HandoverWindow
): WhoTrainedAnswer {
  const next: WhoTrainedAnswer = { ...answer };
  delete next.copiedFrom;
  if (periods.before || periods.from) {
    (next as Record<AnswerRole, AnswerPeriods>)[role] = {
      ...(periods.before ? { before: periods.before } : {}),
      ...(periods.from ? { from: periods.from } : {}),
      splitOn: window.splitOn,
      previousOn: window.previousOn,
    };
  } else {
    delete next[role];
  }
  return next;
}

export type CopyCandidate = { person: Person; samePost: boolean };

const postKey = (context: Context, person: Person) => {
  const position = positionOf(context, person);
  if (position) return `position:${position}`;
  const title = resolveField(context, person, 'jobTitle').value;
  return title === null ? null : `title:${foldText(String(title))}`;
};

// What a copy holds: the source's roles under the source's handovers, which a person whose own
// sheets record none takes along, and which must otherwise be the person's own.
function copyFor(
  source: WhoTrainedAnswer,
  window: HandoverWindow,
  own: HandoverWindow,
  sourceId: string
): WhoTrainedAnswer | null {
  if (own.splitOn !== null && !sameWindow(own, window)) return null;
  return {
    ...(source.trainer ? { trainer: source.trainer } : {}),
    ...(source.verifier ? { verifier: source.verifier } : {}),
    ...(own.splitOn === null && window.splitOn !== null ? { splitCopied: true as const } : {}),
    copiedFrom: source.copiedFrom ?? sourceId,
  };
}

// Those with an answer of their own, or with other handovers on their sheets, are listed apart: a
// copy never changes them.
export function copyCandidates(context: Context, person: Person, domain: TrainingDomain) {
  const post = postKey(context, person);
  const window = windowOf(context, person.id, domain);
  const others = context.proposal.people.filter(
    (other) =>
      other.id !== person.id &&
      personIncluded(context, other) &&
      asksWhoTrained(context, other.id, domain)
  );
  const own = (other: Person) => hasAnswer(domain, answerOf(context.changes, other.id, domain));
  const otherDates = (other: Person) => {
    const theirs = handoverOf(context, other.id);
    return theirs.splitOn !== null && !sameWindow(theirs, window);
  };
  const open: CopyCandidate[] = others
    .filter((other) => !own(other) && !otherDates(other))
    .map((other) => ({
      person: other,
      samePost: post !== null && postKey(context, other) === post,
    }))
    .sort((a, b) => Number(b.samePost) - Number(a.samePost));
  return {
    open,
    answered: others.filter(own),
    otherDates: others.filter((other) => !own(other) && otherDates(other)),
  };
}

export function withAnswerCopied(
  context: Context,
  from: Person,
  domain: TrainingDomain,
  targetIds: readonly string[]
): Changes {
  const source = liveOf(context, from.id, domain);
  if (!hasAnswer(domain, source)) return context.changes;
  const window = windowOf(context, from.id, domain);
  let changes = context.changes;
  for (const id of targetIds) {
    if (id === from.id || hasAnswer(domain, answerOf(changes, id, domain))) continue;
    const copy = copyFor(source!, window, handoverOf(context, id), from.id);
    if (copy) changes = withAnswer(changes, id, domain, copy);
  }
  return changes;
}

// The database keeps a JSON object's keys in an order of its own.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, each: unknown) =>
    each && typeof each === 'object' && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => a.localeCompare(b)))
      : each
  );

/**
 * The copies made to follow their source's answer as it is now. A source taken out of the import
 * leaves its copies as the answers of those who hold them.
 */
export function settleCopies(context: Context): Changes {
  let changes = context.changes;
  for (let pass = 0; pass < 3; pass++) {
    const before = changes;
    for (const [personId, change] of Object.entries(changes.people)) {
      for (const domain of trainingDomains) {
        const held = change.whoTrained?.[domain];
        const sourceId = held?.copiedFrom;
        if (!held || !sourceId) continue;
        const now = { ...context, changes };
        const source = context.proposal.people.find((each) => each.id === sourceId);
        if (!source || !personIncluded(now, source)) {
          const own = { ...held };
          delete own.copiedFrom;
          changes = withAnswer(changes, personId, domain, own);
          continue;
        }
        const live = liveOf(now, sourceId, domain);
        const copy = hasAnswer(domain, live)
          ? copyFor(live!, windowOf(now, sourceId, domain), handoverOf(now, personId), sourceId)
          : null;
        if (canonical(copy) !== canonical(held)) {
          changes = withAnswer(changes, personId, domain, copy ?? undefined);
        }
      }
    }
    if (changes === before) break;
  }
  return changes;
}

export const copiesOf = (context: Context, sourceId: string, domain: TrainingDomain) =>
  context.proposal.people.filter(
    (person) =>
      personIncluded(context, person) &&
      context.changes.people[person.id]?.whoTrained?.[domain]?.copiedFrom === sourceId
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
