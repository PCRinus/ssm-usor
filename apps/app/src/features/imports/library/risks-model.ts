import {
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
} from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';

import { isExpired, joinNames, libraryDay, type LibraryPost } from './library-model';

export type RisksPart = RisksLibraryPart;
export type RiskSheet = RisksProposalSheetsItem;
export type ProposedFactor = RisksProposalSheetsItemFactorsItem;
export type FactorFlag = ProposedFactor['flags'][number];
export type SheetFlag = RiskSheet['flags'][number];
export type SheetChange = RiskImportChanges['sheets'][string];
export type FactorChange = RiskImportFactorChange;
export type RiskChanges = { sheets: Record<string, SheetChange> };
export type LibraryChoice = RiskImportLibraryChoice;
export type ExistingChoice = RiskImportExistingChoice;
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
  // Every class and the component known, as confirming needs of a ticked factor.
  complete: boolean;
  // The flags that still hold once the member's changes are taken into account.
  flags: FactorFlag[];
  edited: boolean;
};

const planFields = ['actions', 'deadline', 'responsiblePerson', 'observations'] as const;

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
  return {
    factor,
    included: change?.included ?? factor.included,
    component,
    group: change?.group ?? factor.group,
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
    complete: component !== null && gravityClass !== null && probabilityClass !== null,
    flags,
    edited: Object.keys(change ?? {}).some((key) => key !== 'included'),
  };
}

/** A flag that asks the member to look again; a person named in a plan field only informs. */
export const asksToCheck = (flag: FactorFlag) => flag.kind !== 'person_named';

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
  // Ticked with every class known: what confirming writes.
  written: number;
  // Unticked because a class or the component is missing.
  incomplete: number;
  leftOut: number;
  toCheck: number;
  // Null for a copy of another sheet of the pack, which follows that sheet's choice.
  choice: LibraryChoice | null;
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
};

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
  const written = factors.filter((factor) => factor.included && factor.complete).length;
  const incomplete = factors.filter((factor) => !factor.included && !factor.complete).length;

  let choice: LibraryChoice | null = null;
  let options: LibraryChoice[] = [];
  if (sheet.copyOf === null) {
    if (sheet.status === 'identical') choice = 'use_existing';
    else if (sheet.factors.length === 0) choice = 'skip';
    else if (sheet.status === 'similar') {
      options = ['use_existing', 'add_new'];
      choice = change?.library ?? sheet.choice;
    } else {
      options = ['add', 'skip'];
      choice = change?.library ?? sheet.choice ?? 'add';
    }
  }
  const createsEntry =
    sheet.copyOf === null &&
    sheet.status !== 'identical' &&
    (choice === 'add' || choice === 'add_new') &&
    written > 0;
  const usesLibrary =
    sheet.status === 'identical' || (sheet.status === 'similar' && choice === 'use_existing');

  const jobPosition = sheet.kind === 'job_position';
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
    written,
    incomplete,
    leftOut: factors.filter((factor) => !factor.included).length,
    toCheck: factors.filter(
      (factor) => factor.included && factor.flags.some((flag) => asksToCheck(flag))
    ).length,
    choice,
    choicePicked: change?.library !== undefined,
    options,
    createsEntry,
    usesLibrary,
    libraryName: change?.libraryName ?? sheet.libraryName,
    posts,
    postsOpen: jobPosition && sheet.undecided && change?.posts === undefined,
    postsGone: (change?.posts ?? []).some((reference) => !context.postsById.has(reference)),
    targets,
    existing,
    toClient,
  };
}

export type Pending = 'posts' | 'library' | 'name';

export function pendingOf(state: SheetState, nameTaken: boolean): Pending[] {
  return [
    ...(state.postsOpen || state.postsGone ? (['posts'] as const) : []),
    ...(state.sheet.status === 'similar' && state.sheet.copyOf === null && !state.choicePicked
      ? (['library'] as const)
      : []),
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
      ? `Mai ai de ales la ${open === 1 ? 'o fișă' : sheetsLabel(open)}.`
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
        ? 'Un factor nu are toate clasele și rămâne pe dinafară până le alegi.'
        : `${factorsLabel(incomplete)} nu au toate clasele și rămân pe dinafară până le alegi.`
    );
  }
  return lines.join(' ');
}

export type RiskSummary = { created: number; used: number; sheets: number; factors: number };

export function riskSummary(states: readonly SheetState[]): RiskSummary {
  const summary = { created: 0, used: 0, sheets: 0, factors: 0 };
  for (const state of states) {
    if (state.createsEntry) summary.created += 1;
    else if (state.sheet.copyOf === null && state.usesLibrary && state.written > 0) {
      summary.used += 1;
    }
    if (state.written === 0) continue;
    const sheets =
      state.posts === null
        ? (state.existing?.choice ?? 'append') === 'keep'
          ? 0
          : 1
        : state.targets.filter((target) => target.choice !== 'keep').length;
    summary.sheets += sheets;
    summary.factors += sheets * state.written;
  }
  return summary;
}

export function confirmSentence(summary: RiskSummary) {
  const parts = [
    ...(summary.created > 0
      ? [
          `adăugăm ${summary.created === 1 ? 'o evaluare' : evaluationsLabel(summary.created)} în bibliotecă`,
        ]
      : []),
    ...(summary.used > 0
      ? [
          summary.used === 1
            ? 'folosim una pe care o ai deja'
            : `folosim ${evaluationsLabel(summary.used)} pe care le ai deja`,
        ]
      : []),
  ];
  if (summary.sheets === 0) {
    return parts.length === 0
      ? 'Nu adăugăm nimic în bibliotecă și nu scriem nimic pe fișele clientului.'
      : `Când confirmi, ${joinNames(parts)}, fără să scriem factori pe fișele clientului.`;
  }
  const factors = summary.factors === 1 ? 'un factor' : factorsLabel(summary.factors);
  const sheets =
    summary.sheets === 1 ? 'o fișă a clientului' : `${sheetsLabel(summary.sheets)} ale clientului`;
  return `Când confirmi, ${joinNames([...parts, `scriem ${factors} pe ${sheets}`])}.`;
}

export const kindLabels: Record<RiskSheet['kind'], string> = {
  job_position: 'Post de lucru',
  sensitive_groups: 'Grupuri sensibile',
  other: 'În afara posturilor',
};

export const libraryChoiceLabels: Record<LibraryChoice, string> = {
  add: 'Adaugă în bibliotecă',
  skip: 'Nu adăuga',
  use_existing: 'Folosește ce ai',
  add_new: 'Adaugă ca nouă',
};

export const existingChoiceLabels: Record<ExistingChoice, string> = {
  append: 'Adaugă după cei existenți',
  replace: 'Înlocuiește',
  keep: 'Lasă cum e',
};

function clientTarget(state: SheetState) {
  if (state.posts === null) {
    return {
      sheet:
        state.sheet.kind === 'sensitive_groups'
          ? 'fișa grupurilor sensibile'
          : `fișa „${state.sheet.name}”`,
      plural: false,
    };
  }
  const writing = state.targets.filter((target) => target.choice !== 'keep').length;
  return writing > 1
    ? { sheet: `fișele celor ${writing} posturi`, plural: true }
    : { sheet: 'fișa postului', plural: false };
}

// The pack's factors reach no sheet of the client because the member kept the existing ones,
// or, with null, because the sheet goes to no post.
function keptSheets(state: SheetState) {
  if (state.posts === null) return 'fișa clientului rămâne cum e';
  if (state.targets.length > 1) return 'fișele posturilor rămân cum sunt';
  if (state.targets.length === 1) return 'fișa postului rămâne cum e';
  return null;
}

export function libraryOutcome(state: SheetState) {
  const client = state.toClient ? clientTarget(state) : null;
  const gets = client?.plural ? 'primesc' : 'primește';
  const kept = keptSheets(state);
  switch (state.choice) {
    case 'add':
      return client
        ? `Intră în bibliotecă ca evaluare nouă, iar ${client.sheet} ${gets} factorii din pachet.`
        : kept
          ? `Intră în bibliotecă ca evaluare nouă, iar ${kept}.`
          : 'Intră în bibliotecă ca evaluare nouă, fără să ajungă la vreun post.';
    case 'add_new':
      return client
        ? `Factorii din pachet intră în bibliotecă ca evaluare separată, iar ${client.sheet} îi ${gets} tot pe ei.`
        : kept
          ? `Factorii din pachet intră în bibliotecă ca evaluare separată, iar ${kept}.`
          : 'Factorii din pachet intră în bibliotecă ca evaluare separată.';
    case 'use_existing':
      return client
        ? `Evaluarea ta rămâne cum e; ${client.sheet} ${gets} factorii din pachet, legați de ea.`
        : kept
          ? `Evaluarea ta rămâne cum e, iar ${kept}.`
          : 'Evaluarea ta rămâne cum e, iar factorii din pachet nu ajung nicăieri.';
    case 'skip':
      return client
        ? `Biblioteca rămâne cum e; factorii din pachet ajung doar pe ${client.sheet}.`
        : kept
          ? `Biblioteca rămâne cum e, iar ${kept}: factorii din pachet nu ajung nicăieri.`
          : 'Nu ajunge nicăieri: nici în bibliotecă, nici la vreun post.';
    default:
      return '';
  }
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

export const rowCells = (text: string) =>
  text
    .replace(/^\|\s*|\s*\|$/gu, '')
    .split(' | ')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '');

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
      return 'Le citim din pachet. Nu te țin pe loc: verifici clientul între timp.';
    case 'failed':
      return part.failureReason ?? 'Citirea evaluărilor de risc s-a oprit.';
    case 'confirmed':
      return part.confirmedAt ? `Confirmate pe ${libraryDay(part.confirmedAt)}.` : 'Confirmate.';
    case 'nothing_new':
    case 'to_review': {
      const counts = part.counts ?? { identical: 0, similar: 0, new: 0, unread: 0 };
      const total = part.proposal?.sheets.length ?? counts.identical + counts.similar + counts.new;
      const kinds = [
        ...(counts.new > 0 ? [newLabel(counts.new)] : []),
        ...(counts.similar > 0 ? [similarLabel(counts.similar)] : []),
        ...(counts.identical > 0 ? [`${counts.identical} deja în bibliotecă`] : []),
      ];
      const found = `De verificat: ${total === 1 ? 'o fișă' : sheetsLabel(total)}${kinds.length > 0 ? `, ${joinNames(kinds)}` : ''}.`;
      return clientConfirmed ? found : `${found} Le confirmi după client.`;
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
