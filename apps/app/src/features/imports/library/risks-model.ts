import {
  foldText,
  isUnacceptableRiskLevel,
  type PreventionMeasureKind,
  type RiskImportChanges,
  type RiskImportExistingChoice,
  type RiskImportFactorChange,
  type RiskImportLibraryChoice,
  riskLevel,
  sheetComponents,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';

import type {
  ImportLibraryPart,
  RiskFactorRequest,
  RisksLibraryPart,
  RisksProposalSheetsItem,
  RisksProposalSheetsItemFactorsItem,
  RisksProposalUnmatchedPlanRowsItem,
} from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';
import { missingMeasureText } from '@/features/risk-evaluations/risk-evaluation-schema';

import { leftOutByMember } from '../include-rule';
import { isExpired, joinNames, libraryDay, type LibraryPost } from './library-model';

export type RisksPart = RisksLibraryPart;
export type RiskSheet = RisksProposalSheetsItem;
export type ProposedFactor = RisksProposalSheetsItemFactorsItem;
export type PlanRow = RisksProposalUnmatchedPlanRowsItem;
export type FactorFlag = ProposedFactor['flags'][number];
export type SheetFlag = RiskSheet['flags'][number];
export type SheetChange = RiskImportChanges['sheets'][string];
export type FactorChange = RiskImportFactorChange;
export type RiskChanges = { sheets: Record<string, SheetChange> };
export type LibraryChoice = RiskImportLibraryChoice;
export type ExistingChoice = RiskImportExistingChoice;
export type LibraryName = RisksPart['libraryNames'][number];
type Measure = { kind: PreventionMeasureKind; description: string };

export const isRisksLibraryPart = (part: ImportLibraryPart): part is RisksPart =>
  part.part === 'risk_evaluations';

export const riskChangesOf = (stored: RisksPart['changes'] | undefined): RiskChanges => ({
  sheets: (stored?.sheets ?? {}) as Record<string, SheetChange>,
});

export function withField<T extends object, K extends keyof T>(
  current: T,
  key: K,
  value: T[K] | undefined
): T {
  const next = { ...current };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

const isEmpty = (value: object | undefined) => !value || Object.keys(value).length === 0;

export function cleanRiskChanges(changes: RiskChanges): RiskChanges {
  const sheets: Record<string, SheetChange> = {};
  for (const [key, change] of Object.entries(changes.sheets)) {
    const next = { ...change };
    if (next.factors) {
      const factors = Object.fromEntries(
        Object.entries(next.factors).filter(([, factor]) => !isEmpty(factor))
      );
      if (isEmpty(factors)) delete next.factors;
      else next.factors = factors;
    }
    if (isEmpty(next.postChoices)) delete next.postChoices;
    if (!isEmpty(next)) sheets[key] = next;
  }
  return { sheets };
}

export type FactorState = {
  factor: ProposedFactor;
  included: boolean;
  component: WorkSystemComponent | null;
  group: string;
  description: string;
  gravityClass: number | null;
  probabilityClass: number | null;
  // Null while a class is missing.
  level: number | null;
  measures: Measure[];
  actions: string | null;
  deadline: string | null;
  responsiblePerson: string | null;
  observations: string | null;
  // What confirming needs of a ticked factor and it still lacks.
  missing: Missing[];
  complete: boolean;
  // The flags that still hold once the member's changes are taken into account.
  flags: FactorFlag[];
  edited: boolean;
};

const planFields = ['actions', 'deadline', 'responsiblePerson', 'observations'] as const;

export type Missing = 'component' | 'classes' | 'group';

const missingNames: Record<Missing, string> = {
  component: 'componenta',
  classes: 'clasele',
  group: 'grupa',
};

export const missingText = (missing: readonly Missing[]) =>
  joinNames(missing.map((each) => missingNames[each]));

export const lacksText = (missing: readonly Missing[]) =>
  `îi ${missing.length === 1 && missing[0] !== 'classes' ? 'lipsește' : 'lipsesc'} ${missingText(missing)}`;

const pick = <T>(change: T | undefined, proposed: T) => (change === undefined ? proposed : change);

export function factorState(factor: ProposedFactor, change?: FactorChange): FactorState {
  const component = change?.component ?? factor.component;
  const gravityClass = change?.gravityClass ?? factor.gravityClass;
  const probabilityClass = change?.probabilityClass ?? factor.probabilityClass;
  const classesChanged =
    change?.gravityClass !== undefined || change?.probabilityClass !== undefined;
  const flags = factor.flags.filter((flag) => {
    switch (flag.kind) {
      case 'class_missing':
        return (
          (flag.field === 'gravity' ? change?.gravityClass : change?.probabilityClass) === undefined
        );
      case 'unknown_component':
        return change?.component === undefined;
      case 'missing_group':
        return change?.group === undefined;
      case 'level_mismatch':
        return !classesChanged;
      case 'consequence_mismatch':
        return change?.gravityClass === undefined;
      case 'measure_kind_guessed':
      case 'measures_cut':
        return change?.measures === undefined;
      case 'person_named':
        return change?.[flag.field] === undefined;
      default:
        return true;
    }
  });
  const group = change?.group ?? factor.group;
  const missing: Missing[] = [
    ...(component === null ? (['component'] as const) : []),
    ...(gravityClass === null || probabilityClass === null ? (['classes'] as const) : []),
    ...(group.trim() === '' ? (['group'] as const) : []),
  ];
  return {
    factor,
    included: change?.included ?? factor.included,
    component,
    group,
    description: change?.description ?? factor.description,
    gravityClass,
    probabilityClass,
    level:
      gravityClass !== null && probabilityClass !== null
        ? riskLevel(gravityClass, probabilityClass)
        : null,
    measures: change?.measures ?? factor.measures,
    actions: pick(change?.actions, factor.actions),
    deadline: pick(change?.deadline, factor.deadline),
    responsiblePerson: pick(change?.responsiblePerson, factor.responsiblePerson),
    observations: pick(change?.observations, factor.observations),
    missing,
    complete: missing.length === 0,
    flags,
    edited: Object.keys(change ?? {}).some((key) => key !== 'included'),
  };
}

/** A flag that asks the member to look again; a person named in a plan field only informs. */
export const asksToCheck = (flag: FactorFlag) => flag.kind !== 'person_named';

export type MeasureGap = { text: string; explainsLevel: boolean };

export function measureGap(state: FactorState): MeasureGap | null {
  const { level, gravityClass, probabilityClass } = state;
  if (level === null || gravityClass === null || probabilityClass === null) return null;
  if (!isUnacceptableRiskLevel(level) || state.measures.length > 0) return null;
  const mismatch = state.flags.find((flag) => flag.kind === 'level_mismatch');
  const printedLevel = mismatch?.kind === 'level_mismatch' ? mismatch.printed : null;
  return {
    text: missingMeasureText({ level, gravityClass, probabilityClass, printedLevel }),
    explainsLevel: printedLevel !== null && !isUnacceptableRiskLevel(printedLevel),
  };
}

export const needsCheck = (state: FactorState) =>
  state.included && (state.flags.some(asksToCheck) || measureGap(state) !== null);

const sameMeasures = (a: readonly Measure[], b: readonly Measure[]) =>
  a.length === b.length &&
  a.every((measure, index) => {
    const other = b[index]!;
    return measure.kind === other.kind && measure.description.trim() === other.description.trim();
  });

export function factorChangeFrom(factor: ProposedFactor, request: RiskFactorRequest): FactorChange {
  let change: FactorChange = {};
  if (request.component !== factor.component) change.component = request.component;
  if (request.group.trim() !== factor.group.trim()) change.group = request.group.trim();
  if (request.description.trim() !== factor.description.trim()) {
    change.description = request.description.trim();
  }
  if (request.gravityClass !== factor.gravityClass) change.gravityClass = request.gravityClass;
  if (request.probabilityClass !== factor.probabilityClass) {
    change.probabilityClass = request.probabilityClass;
  }
  const measures = request.measures ?? [];
  if (!sameMeasures(measures, factor.measures)) change.measures = measures;
  for (const field of planFields) {
    const value = request[field] ?? null;
    if (value !== factor[field]) change = { ...change, [field]: value };
  }
  if (!factor.included) change.included = true;
  return change;
}

export type PostTarget = {
  // As the changes name the post.
  reference: string;
  post: LibraryPost;
  // The factors its sheet already has.
  existing: number;
  choice: ExistingChoice;
  picked: boolean;
};

export type SheetState = {
  sheet: RiskSheet;
  factors: FactorState[];
  // The plan rows placed on the sheet, which it takes only once the member adds them.
  planRows: FactorState[];
  // Ticked with every class known, plan rows added included: what confirming writes.
  written: number;
  // Of the sheet's own factors: unticked because a class, the component or the group is missing.
  incomplete: number;
  leftOut: number;
  toCheck: number;
  // Null for a copy of another sheet of the pack, which follows that sheet's choice.
  choice: RiskSheet['choice'];
  choicePicked: boolean;
  options: LibraryChoice[];
  createsEntry: boolean;
  usesLibrary: boolean;
  libraryName: string;
  // A post's sheet: the posts it applies to, as the changes name them; null for a client-level one.
  posts: string[] | null;
  postsOpen: boolean;
  // A post the member picked is no longer one the sheet can go on: archived, or left out.
  postsGone: boolean;
  targets: PostTarget[];
  // A client-level sheet's evaluation, when the client has one already.
  existing: { factors: number; choice: ExistingChoice; picked: boolean } | null;
  // Whether confirming writes factors on any of the client's sheets.
  toClient: boolean;
};

export type SheetContext = {
  postReferences: Record<string, string | null>;
  // The posts a sheet can go on, by `postsByReference`.
  postsById: ReadonlyMap<string, LibraryPost>;
  existingByReference: ReadonlyMap<string, number>;
  // The client's sheets now, which confirming follows; the reading's counts while it has none.
  existingFactors: RisksPart['existingFactors'];
  // By the sheet's key, from `placedPlanRows`.
  planFactors?: ReadonlyMap<string, readonly ProposedFactor[]>;
};

const placedOn = (row: PlanRow, sheets: ReadonlyMap<string, RiskSheet>) => {
  const sheet = row.sheet ? sheets.get(row.sheet) : undefined;
  return row.factor && sheet && sheet.factors.length > 0 ? sheet : null;
};

export function placedPlanRows(rows: readonly PlanRow[], sheets: readonly RiskSheet[]) {
  const byKey = new Map(sheets.map((sheet) => [sheet.key, sheet]));
  const placed = new Map<string, ProposedFactor[]>();
  for (const row of rows) {
    const sheet = placedOn(row, byKey);
    if (sheet) placed.set(sheet.key, [...(placed.get(sheet.key) ?? []), row.factor!]);
  }
  return placed;
}

export function unplacedPlanRows(rows: readonly PlanRow[], sheets: readonly RiskSheet[]) {
  const byKey = new Map(sheets.map((sheet) => [sheet.key, sheet]));
  return rows.filter((row) => !placedOn(row, byKey));
}

/** The factors each post's sheet had when the pack was read, by the post as the changes name it. */
export function existingByReference(
  sheets: readonly RiskSheet[],
  postReferences: Record<string, string | null>
) {
  const existing = new Map<string, number>();
  for (const sheet of sheets) {
    for (const post of sheet.posts) {
      const reference = postReferences[post.name];
      if (reference && post.existingFactors > (existing.get(reference) ?? 0)) {
        existing.set(reference, post.existingFactors);
      }
    }
  }
  return existing;
}

export function defaultSheetPosts(sheet: RiskSheet, postReferences: Record<string, string | null>) {
  return [
    ...new Set(
      sheet.posts.flatMap((post) => (postReferences[post.name] ? [postReferences[post.name]!] : []))
    ),
  ];
}

export function sheetState(
  sheet: RiskSheet,
  change: SheetChange | undefined,
  context: SheetContext
): SheetState {
  const factors = sheet.factors.map((factor) => factorState(factor, change?.factors?.[factor.key]));
  const planRows = (context.planFactors?.get(sheet.key) ?? []).map((factor) =>
    factorState(factor, change?.factors?.[factor.key])
  );
  const written = [...factors, ...planRows].filter(
    (factor) => factor.included && factor.complete
  ).length;
  const incomplete = factors.filter((factor) => !factor.included && !factor.complete).length;

  const jobPosition = sheet.kind === 'job_position';
  // A post's new sheet always goes to the library and a client-level one never does (ADR 036).
  let choice: RiskSheet['choice'] = null;
  let options: LibraryChoice[] = [];
  if (sheet.copyOf === null) {
    if (sheet.status === 'identical') choice = 'use_existing';
    else if (!jobPosition || sheet.factors.length === 0) choice = 'skip';
    else if (sheet.status === 'similar') {
      options = ['use_existing', 'add_new'];
      choice = change?.library ?? sheet.choice;
    } else choice = 'add';
  }
  const createsEntry =
    jobPosition &&
    sheet.copyOf === null &&
    sheet.status !== 'identical' &&
    (choice === 'add' || choice === 'add_new') &&
    written > 0;
  const usesLibrary =
    jobPosition &&
    sheet.copyOf === null &&
    (sheet.status === 'identical' || (sheet.status === 'similar' && choice === 'use_existing'));

  const posts = jobPosition
    ? (change?.posts ?? defaultSheetPosts(sheet, context.postReferences))
    : null;
  const targets: PostTarget[] = [];
  const seen = new Set<string>();
  for (const reference of posts ?? []) {
    const post = context.postsById.get(reference);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    const existing =
      (post.jobPositionId
        ? context.existingFactors?.jobPositions[post.jobPositionId]
        : undefined) ??
      context.existingByReference.get(post.id) ??
      context.existingByReference.get(reference) ??
      0;
    const picked = change?.postChoices?.[reference];
    targets.push({
      reference,
      post,
      existing,
      choice: picked ?? (existing > 0 ? 'keep' : 'append'),
      picked: picked !== undefined,
    });
  }
  const clientFactors = context.existingFactors
    ? (context.existingFactors.sheets[sheet.key] ?? 0)
    : (sheet.existing?.factors ?? 0);
  const existing =
    !jobPosition && clientFactors > 0
      ? {
          factors: clientFactors,
          choice: change?.existingChoice ?? 'keep',
          picked: change?.existingChoice !== undefined,
        }
      : null;
  const toClient =
    written > 0 &&
    (jobPosition
      ? targets.some((target) => target.choice !== 'keep')
      : (existing?.choice ?? 'append') !== 'keep');

  return {
    sheet,
    factors,
    planRows,
    written,
    incomplete,
    leftOut: factors.filter((factor) => !factor.included).length,
    toCheck: factors.filter(needsCheck).length,
    choice,
    choicePicked: change?.library !== undefined,
    options,
    createsEntry,
    usesLibrary,
    libraryName: change?.libraryName ?? sheet.libraryName,
    posts,
    postsOpen: jobPosition && sheet.undecided && change?.posts === undefined,
    postsGone: (posts ?? []).some((reference) => !context.postsById.has(reference)),
    targets,
    existing,
    toClient,
  };
}

export type Pending = 'posts' | 'library' | 'name';

export function pendingOf(state: SheetState, nameTaken: boolean): Pending[] {
  return [
    ...(state.postsOpen || state.postsGone ? (['posts'] as const) : []),
    ...(state.options.length > 0 && !state.choicePicked ? (['library'] as const) : []),
    ...(nameTaken && state.createsEntry ? (['name'] as const) : []),
  ];
}

const pendingLines: Record<Pending, string> = {
  posts: 'Mai ai de ales posturile',
  library: 'Mai ai de ales ce intră în bibliotecă',
  name: 'Mai ai de schimbat numele',
};

export const pendingLine = (pending: readonly Pending[]) =>
  pending.length > 1 ? `Mai ai ${pending.length} lucruri de făcut` : pendingLines[pending[0]!];

export const sheetsLabel = (count: number) => roCount(count, 'fișă', 'fișe');
export const factorsLabel = (count: number) => roCount(count, 'factor', 'factori');
export const evaluationsLabel = (count: number) => roCount(count, 'evaluare', 'evaluări');

export function leftSentence(states: readonly SheetState[], open: number) {
  const incomplete = states.reduce((sum, state) => sum + state.incomplete, 0);
  const toCheck = states.reduce((sum, state) => sum + state.toCheck, 0);
  const lines = [
    open > 0
      ? `Mai ai de ales la ${open === 1 ? 'o evaluare' : evaluationsLabel(open)}.`
      : 'Ai ales tot ce era de ales.',
  ];
  if (toCheck > 0) {
    lines.push(
      toCheck === 1
        ? 'Un factor are ceva de verificat, marcat la el.'
        : `${factorsLabel(toCheck)} au ceva de verificat, marcat la fiecare.`
    );
  }
  if (incomplete > 0) {
    lines.push(
      incomplete === 1
        ? 'Unui factor îi lipsesc clasele, componenta sau grupa și rămâne pe dinafară până le alegi.'
        : `${factorsLabel(incomplete)} nu au clasele, componenta sau grupa și rămân pe dinafară până le alegi.`
    );
  }
  return lines.join(' ');
}

export type RiskSummary = {
  // The entries confirming adds, with the factors each takes.
  created: { name: string; factors: number }[];
  // The library's entries the client's factors are linked to.
  used: string[];
  sheets: number;
  factors: number;
  // The post whose sheet is the only one written, if it is a post's.
  post: string | null;
};

export function riskSummary(states: readonly SheetState[]): RiskSummary {
  const summary: RiskSummary = { created: [], used: [], sheets: 0, factors: 0, post: null };
  const writing: (string | null)[] = [];
  for (const state of states) {
    if (state.createsEntry) {
      summary.created.push({ name: state.libraryName, factors: state.written });
    } else if (state.usesLibrary && state.written > 0 && state.sheet.match) {
      summary.used.push(state.sheet.match.name);
    }
    if (state.written === 0) continue;
    const targets =
      state.posts === null
        ? (state.existing?.choice ?? 'append') === 'keep'
          ? []
          : [null]
        : state.targets
            .filter((target) => target.choice !== 'keep')
            .map((target) => target.post.name);
    summary.sheets += targets.length;
    summary.factors += targets.length * state.written;
    writing.push(...targets);
  }
  summary.post = writing.length === 1 ? writing[0]! : null;
  return summary;
}

const quoted = (names: readonly string[]) => joinNames(names.map((name) => `„${name}”`));

const factorsCount = (count: number) => (count === 1 ? 'un factor' : factorsLabel(count));

export function confirmSentence(summary: RiskSummary) {
  const { created, used } = summary;
  const parts = [
    ...(created.length === 1
      ? [
          `adăugăm ${quoted([created[0]!.name])} în bibliotecă, cu ${factorsCount(created[0]!.factors)}`,
        ]
      : created.length > 1
        ? [
            `adăugăm ${created.length > 3 ? evaluationsLabel(created.length) : quoted(created.map((entry) => entry.name))} în bibliotecă`,
          ]
        : []),
    ...(used.length > 0
      ? [
          `folosim ${used.length > 3 ? evaluationsLabel(used.length) : quoted(used)} din biblioteca ta`,
        ]
      : []),
  ];
  // The factor count after one entry's name is an aside, closed by a comma before "și".
  const join = (list: readonly string[]) =>
    created.length === 1 && list.length > 1
      ? `${list.slice(0, -1).join(', ')}, și ${list.at(-1)}`
      : joinNames(list);
  if (summary.sheets === 0) {
    return parts.length === 0
      ? 'Nu adăugăm nimic în bibliotecă și nu scriem nimic pe fișele clientului.'
      : `Când confirmi, ${join(parts)}, fără să scriem factori pe fișele clientului.`;
  }
  const target = summary.post
    ? `fișa postului ${quoted([summary.post])}`
    : summary.sheets === 1
      ? 'o fișă a clientului'
      : `${sheetsLabel(summary.sheets)} ale clientului`;
  if (created.length === 1 && used.length === 0 && created[0]!.factors === summary.factors) {
    return `Când confirmi, ${parts[0]}, și îi scriem pe ${target}.`;
  }
  return `Când confirmi, ${join([...parts, `scriem ${factorsCount(summary.factors)} pe ${target}`])}.`;
}

export const kindLabels: Record<RiskSheet['kind'], string> = {
  job_position: 'Post de lucru',
  sensitive_groups: 'Grupuri sensibile',
  other: 'În afara posturilor',
};

export const libraryChoiceLabels: Record<LibraryChoice, string> = {
  use_existing: 'Folosește ce ai',
  add_new: 'Adaugă ca nouă',
};

export const existingChoiceLabels: Record<ExistingChoice, string> = {
  append: 'Adaugă după cei existenți',
  replace: 'Înlocuiește',
  keep: 'Lasă cum e',
};

function clientTarget(state: SheetState) {
  const writing = state.targets.filter((target) => target.choice !== 'keep').length;
  if (writing > 1) return { sheet: `fișele celor ${writing} posturi`, plural: true };
  return writing === 1 ? { sheet: 'fișa postului', plural: false } : null;
}

/** What "Folosește ce ai" does with a post's sheet similar to an entry. */
export function usedOutcome(state: SheetState) {
  const client = state.toClient ? clientTarget(state) : null;
  if (client) {
    return `Evaluarea ta rămâne cum e; ${client.sheet} ${client.plural ? 'primesc' : 'primește'} factorii din pachet, legați de ea.`;
  }
  if (state.targets.length > 1) {
    return 'Evaluarea ta rămâne cum e, iar fișele posturilor rămân cum sunt.';
  }
  if (state.targets.length === 1)
    return 'Evaluarea ta rămâne cum e, iar fișa postului rămâne cum e.';
  return 'Evaluarea ta rămâne cum e, iar factorii din pachet nu ajung nicăieri.';
}

export function similarCounts(match: NonNullable<RiskSheet['match']>) {
  return `${joinNames([
    roCount(match.pairs.length, 'factor la fel', 'factori la fel'),
    ...(match.onlyInPack.length > 0 ? [`${match.onlyInPack.length} doar în pachet`] : []),
    ...(match.onlyInLibrary.length > 0
      ? [`${match.onlyInLibrary.length} doar în evaluarea ta`]
      : []),
  ])}.`;
}

export type NameNote = { text: string; entry: LibraryName | null };

/** Why a new entry has the name it has, and the library's entry that holds the name it lost. */
export function nameNote(state: SheetState, entries: readonly LibraryName[]): NameNote | null {
  const { sheet } = state;
  if (state.libraryName !== sheet.libraryName) {
    return { text: `Numele l-ai ales tu; propunerea era „${sheet.libraryName}”.`, entry: null };
  }
  if (sheet.takenName) {
    const taken = foldText(sheet.takenName);
    if (sheet.match && foldText(sheet.match.name) === taken) {
      return {
        text: `Numele „${sheet.takenName}” e al evaluării tale asemănătoare, așa că am adăugat numele clientului.`,
        entry: null,
      };
    }
    const entry = entries.find((each) => foldText(each.name) === taken) ?? null;
    return {
      text: `Ai deja o evaluare${entry?.archived ? ' arhivată' : ''} numită „${sheet.takenName}”, cu alți factori, așa că am adăugat numele clientului.`,
      entry,
    };
  }
  const posts = sheet.posts.map((post) => post.name);
  const forPosts =
    posts.length > 1
      ? `, care e pentru posturile ${joinNames(posts)}`
      : posts.length === 1
        ? `, care e pentru postul ${posts[0]}`
        : '';
  switch (sheet.nameFrom) {
    case 'work':
      return { text: `Am numit-o după munca din fișă${forPosts}.`, entry: null };
    case 'workplace':
      return { text: `E locul de muncă din titlul fișei${forPosts}.`, entry: null };
    case 'post':
      return { text: 'E numele postului din document.', entry: null };
    case 'heading':
      return {
        text:
          posts.length > 1
            ? `E numele din titlul fișei, care e pentru posturile ${joinNames(posts)}.`
            : 'E numele din titlul fișei.',
        entry: null,
      };
    default:
      return null;
  }
}

export function nameSuggestions(
  state: SheetState,
  entries: readonly LibraryName[],
  packNames: readonly string[]
) {
  const { sheet } = state;
  return [
    ...new Set(
      [
        sheet.libraryName,
        sheet.workName,
        sheet.workplace,
        ...sheet.posts.map((post) => post.name),
        sheet.name,
      ]
        .flatMap((each) => each?.trim() ?? [])
        .filter((each) => each.length >= 2 && !takenNameProblem(each, entries, packNames))
    ),
  ].filter((each) => each !== state.libraryName);
}

export function takenNameProblem(
  name: string,
  entries: readonly LibraryName[],
  packNames: readonly string[]
) {
  const folded = foldText(name);
  const entry = entries.find((each) => foldText(each.name) === folded);
  if (entry) {
    return `Biblioteca are deja o evaluare${entry.archived ? ' arhivată' : ''} cu acest nume. Alege alt nume.`;
  }
  if (packNames.some((other) => foldText(other) === folded)) {
    return 'Altă evaluare din pachet are deja acest nume. Alege alt nume.';
  }
  return null;
}

export function existingOutcome(choice: ExistingChoice, factors: number) {
  switch (choice) {
    case 'append':
      return `Factorii din pachet se adaugă după ${factors === 1 ? 'cel existent' : `cei ${factors}`}.`;
    case 'replace':
      return factors === 1
        ? 'Factorul existent se șterge, iar locul lui îl iau cei din pachet.'
        : `Cei ${factors} factori existenți se șterg, iar locul lor îl iau cei din pachet.`;
    case 'keep':
      return 'Fișa rămâne cum e: factorii din pachet nu ajung pe ea.';
  }
}

export const removedByMember = (state: FactorState) =>
  leftOutByMember(state.included, state.factor.included);

export function withIncluded(
  change: SheetChange,
  factors: readonly FactorState[],
  included: boolean
): SheetChange {
  const next = { ...change.factors };
  for (const state of factors) {
    next[state.factor.key] = withField(
      next[state.factor.key] ?? {},
      'included',
      included === state.factor.included ? undefined : included
    );
  }
  return { ...change, factors: next };
}

const classNames = { gravity: 'gravitate', probability: 'probabilitate' } as const;

export function factorFlagText(flag: FactorFlag) {
  switch (flag.kind) {
    case 'level_mismatch':
      return `Nivel în document: ${flag.printed}, după metodă: ${flag.grid}`;
    case 'consequence_mismatch':
      return `Consecința din document, „${flag.consequence}”, ține de clasa ${flag.consequenceClass}`;
    case 'class_missing':
      return flag.written.trim() === ''
        ? `Lipsește clasa de ${classNames[flag.field]}`
        : `Clasa de ${classNames[flag.field]} „${flag.written}” nu e pe scară`;
    case 'unknown_component':
      return flag.written.trim() === ''
        ? 'Fără componentă'
        : `Componentă necunoscută: „${flag.written}”`;
    case 'missing_group':
      return 'Fără grupă';
    case 'row_shape':
      return `Rândul are ${flag.cells} coloane în loc de ${flag.expected}`;
    case 'retyped':
      return 'Verifică: citit dintr-un PDF';
    case 'quote_not_found':
      return 'Nu l-am găsit în document';
    case 'person_named':
      return `„${flag.text}” e numele unei persoane: rămâne doar pe fișa clientului`;
    case 'measure_kind_guessed':
      return 'Verifică felul măsurilor';
    case 'measures_cut':
      return `Avea ${flag.count} de măsuri; le-am păstrat pe primele 30`;
  }
}

const textNames = {
  meansOfProduction: 'mijloacele de producție',
  workEnvironment: 'mediul de muncă',
  exposure: 'expunerea',
} as const;

export function sheetFlagText(flag: SheetFlag) {
  switch (flag.kind) {
    case 'quote_not_found':
      return `Nu am găsit în document ${textNames[flag.field]}.`;
    case 'text_cut':
      return `Am tăiat ${textNames[flag.field]} la lungimea cea mai mare pe care o primește fișa.`;
    case 'file_not_found':
      return 'Fișierul fișei nu mai este în import.';
    case 'rows_not_found':
      return 'Nu am găsit în document rândurile tabelului ei.';
    case 'no_factors':
      return 'Nu am găsit niciun factor în tabelul ei.';
    case 'classes_swapped':
      return 'Gravitatea și probabilitatea par inversate în document: verifică clasele.';
  }
}

export type ComponentGroup = { component: WorkSystemComponent | null; factors: FactorState[] };

// In the sheet's order of components, those still unknown last; the pack's order inside each.
export function byComponent(factors: readonly FactorState[]): ComponentGroup[] {
  const groups: ComponentGroup[] = [...sheetComponents, null].map((component) => ({
    component,
    factors: factors.filter((factor) => factor.component === component),
  }));
  return groups.filter((group) => group.factors.length > 0);
}

export function takenSheets(issues: readonly { path: string }[]) {
  return new Set(
    issues.flatMap((issue) => {
      const key = /^sheets\.(.+)\.libraryName$/u.exec(issue.path)?.[1];
      return key ? [key] : [];
    })
  );
}

const atEvaluations = (names: readonly string[]) =>
  names.length === 1 ? `la evaluarea ${quoted(names)}` : `la evaluările ${quoted(names)}`;

export const takenNamesText = (names: readonly string[]) =>
  `Biblioteca are deja o evaluare cu numele ales. Schimbă ${names.length === 1 ? 'numele marcat' : 'numele marcate'} ${atEvaluations(names)}.`;

export const incompleteText = (names: readonly string[]) =>
  `Unii factori incluși nu au clasele, componenta sau grupa. Completează-i la factorii marcați ${atEvaluations(names)} sau oprește-i.`;

export function incompleteFactors(issues: readonly { path: string }[]) {
  const bySheet = new Map<string, Set<string>>();
  for (const issue of issues) {
    const found = /^sheets\.(.+?)\.factors\.(.+)$/u.exec(issue.path);
    if (!found) continue;
    const factors = bySheet.get(found[1]!) ?? new Set<string>();
    factors.add(found[2]!);
    bySheet.set(found[1]!, factors);
  }
  return bySheet;
}

const measureNames: [PreventionMeasureKind, string][] = [
  ['technical', 'Măsuri tehnice'],
  ['organizational', 'Măsuri organizatorice'],
  ['hygienic_sanitary', 'Măsuri igienico-sanitare'],
  ['other', 'Alte măsuri'],
];

const items = (texts: readonly string[]) =>
  texts
    .map((text, index) =>
      index === texts.length - 1 || /[.;:!?]$/u.test(text.trim()) ? text.trim() : `${text.trim()};`
    )
    .join(' ');

export function planFieldsLine(
  state: Pick<
    FactorState,
    'measures' | 'actions' | 'deadline' | 'responsiblePerson' | 'observations'
  >
) {
  return [
    ...measureNames.flatMap(([kind, name]) => {
      const texts = state.measures
        .filter((measure) => measure.kind === kind)
        .map((measure) => measure.description);
      return texts.length > 0 ? [`${name}: ${items(texts)}`] : [];
    }),
    state.actions && `Acțiuni: ${state.actions}`,
    state.deadline && `Termen: ${state.deadline}`,
    state.responsiblePerson && `Răspunde: ${state.responsiblePerson}`,
    state.observations && `Observații: ${state.observations}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function planRowsLine(state: SheetState) {
  const count = state.planRows.length;
  const added = state.planRows.filter((row) => row.included).length;
  const target = state.posts === null ? 'această fișă' : 'acest post';
  const found =
    count === 1
      ? `Un rând din documente e pentru ${target}, dar nu l-am putut lega de niciun factor de pe fișă.`
      : `${roCount(count, 'rând', 'rânduri')} din documente sunt pentru ${target}, dar nu le-am putut lega de niciun factor de pe fișă.`;
  if (added === 0) return found;
  return count === 1
    ? `${found} L-ai adăugat ca factor.`
    : `${found} Ai adăugat ${added === 1 ? 'un factor' : factorsLabel(added)} din ele.`;
}

export const rowCells = (text: string) =>
  text
    .replace(/^\|\s*|\s*\|$/gu, '')
    .split(' | ')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '');

export const looseCells = (text: string) =>
  rowCells(text).filter((cell) => !/^[-–—]+$/u.test(cell));

// The viewer finds a quote in the file's text, where a row's cells sit between bars.
export const rowQuote = (text: string) =>
  rowCells(text).reduce((longest, cell) => (cell.length > longest.length ? cell : longest), '');

const newLabel = (count: number) =>
  count === 1 ? 'una nouă' : `${count} ${count % 100 >= 20 || count % 100 === 0 ? 'de ' : ''}noi`;

const similarLabel = (count: number) =>
  count === 1
    ? 'una asemănătoare'
    : `${count} ${count % 100 >= 20 || count % 100 === 0 ? 'de ' : ''}asemănătoare`;

export function risksPartDescription(part: RisksPart, clientConfirmed: boolean, now = Date.now()) {
  if (isExpired(part, now)) {
    return `A expirat pe ${libraryDay(part.expiresAt!)}, la 14 zile după crearea clientului.`;
  }
  switch (part.status) {
    case 'reading':
      return clientConfirmed
        ? 'Citirea evaluărilor este în lucru.'
        : 'Le citim din pachet. Verifici clientul între timp.';
    case 'failed':
      return part.failureReason ?? 'Citirea evaluărilor de risc s-a oprit.';
    case 'confirmed':
      return part.confirmedAt ? `Confirmate pe ${libraryDay(part.confirmedAt)}.` : 'Confirmate.';
    case 'nothing_new':
      return 'Nimic nou: le ai deja în bibliotecă și nu e nimic de scris pe fișele clientului.';
    case 'to_review': {
      const counts = part.counts ?? { identical: 0, similar: 0, new: 0, unread: 0 };
      if (counts.new === 0 && counts.similar === 0 && counts.identical > 0) {
        return 'Deja în bibliotecă. Confirmarea le scrie pe fișele clientului.';
      }
      const total = part.proposal?.sheets.length ?? counts.identical + counts.similar + counts.new;
      const kinds = [
        ...(counts.new > 0 ? [newLabel(counts.new)] : []),
        ...(counts.similar > 0 ? [similarLabel(counts.similar)] : []),
        ...(counts.identical > 0 ? [`${counts.identical} deja în bibliotecă`] : []),
      ];
      return `${total === 1 ? 'O evaluare' : evaluationsLabel(total)}${kinds.length > 0 ? `, ${joinNames(kinds)}` : ''}.`;
    }
  }
}

// The viewer marks a quote, and a factor's description is copied from its cell as written.
export const factorSource = (
  state: FactorState,
  sheetFile: string
): { file: string; quote: string } => ({
  file: state.factor.source?.file ?? sheetFile,
  quote: state.factor.description.split(/\s+/u).slice(0, 30).join(' '),
});
