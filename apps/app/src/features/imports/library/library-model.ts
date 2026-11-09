import {
  type InstructionBody,
  instructionCategoriesByDomain,
  type InstructionCategory,
  type InstructionDomain,
  type InstructionsPart as PartName,
  isInstructionsPart,
  splitFlagMessages,
} from '@ssm-usor/contracts';

import type {
  ImportLibraryPart,
  ImportLibraryPartsResponse,
  InstructionsLibraryPart,
  InstructionsProposalInstructionsItem,
  InstructionsProposalPositionsItem,
  InstructionsProposalUnreadItem,
} from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';

export type LibraryPart = InstructionsLibraryPart;
export type LibraryPost = ImportLibraryPartsResponse['posts'][number];
export type ProposedInstruction = InstructionsProposalInstructionsItem;
export type ProposedPosition = InstructionsProposalPositionsItem;
export type PartStatus = LibraryPart['status'];
export type Choice = 'use_existing' | 'add_new';

export type InstructionChange = {
  included?: boolean;
  title?: string;
  category?: InstructionCategory;
  choice?: Choice;
  posts?: string[];
  body?: InstructionBody;
};

export function withChange<K extends keyof InstructionChange>(
  current: InstructionChange,
  key: K,
  value: InstructionChange[K] | undefined
): InstructionChange {
  const next = { ...current };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export type LibraryChanges = { instructions: Record<string, InstructionChange> };

// The risk evaluations' part has a review of its own.
export const isInstructionsLibraryPart = (part: ImportLibraryPart): part is LibraryPart =>
  isInstructionsPart(part.part);

export const hasInstructionsParts = (parts: readonly { part: ImportLibraryPart['part'] }[]) =>
  parts.some((part) => isInstructionsPart(part.part));

export function partsNoun(parts: readonly { part: ImportLibraryPart['part'] }[]) {
  const names = [
    ...(hasInstructionsParts(parts) ? ['instrucțiunile proprii'] : []),
    ...(parts.some((part) => part.part === 'risk_evaluations') ? ['evaluările de risc'] : []),
  ];
  if (names.length === 0) return null;
  const text = names.join(' și ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export const partOfDomain: Record<InstructionDomain, PartName> = {
  ssm: 'instructions_ssm',
  su: 'instructions_su',
};

export const partLabels: Record<PartName, string> = {
  instructions_ssm: 'IPSSM',
  instructions_su: 'IPSU',
};

export const partOrder: readonly PartName[] = ['instructions_ssm', 'instructions_su'];

export const statusLabels: Record<PartStatus, string> = {
  reading: 'Se citește',
  to_review: 'De verificat',
  nothing_new: 'Nimic nou',
  failed: 'Nu s-a putut citi',
  confirmed: 'Confirmat',
};

const dayFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

export const libraryDay = (iso: string) => dayFormat.format(new Date(iso));

type PartTiming = { status: PartStatus; expiresAt: string | null };

export const isExpired = (part: PartTiming, now = Date.now()) =>
  part.status !== 'confirmed' && part.expiresAt !== null && Date.parse(part.expiresAt) <= now;

/** A part the member still has to confirm: neither confirmed nor past its 14 days. */
export const isOpenPart = (part: PartTiming, now = Date.now()) =>
  part.status !== 'confirmed' && !isExpired(part, now);

export const changesOf = (stored: LibraryPart['changes'] | undefined): LibraryChanges => ({
  instructions: (stored?.instructions ?? {}) as Record<string, InstructionChange>,
});

export const isReviewable = (status: PartStatus) =>
  status === 'to_review' || status === 'nothing_new';

export function defaultPosts(
  instruction: Pick<ProposedInstruction, 'posts'>,
  positionPosts: Record<string, string | null>
) {
  return [
    ...new Set(
      instruction.posts.flatMap((key) => (positionPosts[key] ? [positionPosts[key]] : []))
    ),
  ];
}

export type RowState = {
  instruction: ProposedInstruction;
  included: boolean;
  choice: Choice | null;
  choicePicked: boolean;
  // Whether confirming takes the library's module as it is.
  usesLibrary: boolean;
  title: string;
  category: InstructionCategory;
  body: InstructionBody;
  posts: string[];
  edited: { title: boolean; category: boolean; body: boolean; posts: boolean };
};

export function rowState(
  instruction: ProposedInstruction,
  change: InstructionChange | undefined,
  positionPosts: Record<string, string | null>
): RowState {
  const choice = instruction.status === 'similar' ? (change?.choice ?? instruction.choice) : null;
  return {
    instruction,
    included: change?.included !== false,
    choice,
    choicePicked: change?.choice !== undefined,
    usesLibrary:
      instruction.status === 'identical' ||
      (instruction.status === 'similar' && choice !== 'add_new'),
    title: change?.title ?? instruction.title,
    category: change?.category ?? instruction.category,
    body: change?.body ?? instruction.body,
    posts: change?.posts ?? defaultPosts(instruction, positionPosts),
    edited: {
      title: change?.title !== undefined && change.title !== instruction.title,
      category: change?.category !== undefined && change.category !== instruction.category,
      body: change?.body !== undefined,
      posts: change?.posts !== undefined,
    },
  };
}

export function instructionPending(
  row: RowState,
  postsById: ReadonlyMap<string, LibraryPost>,
  titleTaken: boolean
) {
  if (!row.included) return [];
  return [
    ...(titleTaken && !row.usesLibrary ? ['title'] : []),
    ...(row.instruction.status === 'similar' && !row.choicePicked ? ['ce primesc posturile'] : []),
    ...(row.posts.some((post) => postsById.has(post)) ? [] : ['posturile']),
  ];
}

export const reviewedInstructions = (instructions: readonly ProposedInstruction[]) =>
  instructions.filter((instruction) => instruction.status !== 'identical');

export const identicalInstructions = (instructions: readonly ProposedInstruction[]) =>
  instructions.filter((instruction) => instruction.status === 'identical');

export const categoriesOf = (domain: InstructionDomain) => instructionCategoriesByDomain[domain];

export const instructionsLabel = (count: number) => roCount(count, 'instrucțiune', 'instrucțiuni');

export function identicalSentence(count: number) {
  return count === 1
    ? 'O instrucțiune din pachet este deja în biblioteca ta'
    : `${instructionsLabel(count)} din pachet sunt deja în biblioteca ta`;
}

const newLabel = (count: number) =>
  count === 1 ? 'una nouă' : `${count} ${count % 100 >= 20 || count % 100 === 0 ? 'de ' : ''}noi`;

const similarLabel = (count: number) =>
  count === 1
    ? 'una asemănătoare'
    : `${count} ${count % 100 >= 20 || count % 100 === 0 ? 'de ' : ''}asemănătoare`;

export function partDescription(part: LibraryPart, clientConfirmed: boolean, now = Date.now()) {
  if (isExpired(part, now)) {
    return `A expirat pe ${libraryDay(part.expiresAt!)}, la 14 zile după crearea clientului.`;
  }
  switch (part.status) {
    case 'reading':
      return 'Le citim din pachet. Nu te țin pe loc: verifici clientul între timp.';
    case 'failed':
      return part.failureReason ?? 'Citirea instrucțiunilor proprii s-a oprit.';
    case 'confirmed':
      return part.confirmedAt ? `Confirmate pe ${libraryDay(part.confirmedAt)}.` : 'Confirmate.';
    case 'nothing_new':
    case 'to_review': {
      const counts = part.counts ?? { identical: 0, similar: 0, new: 0, unread: 0 };
      const asked = [
        ...(counts.new > 0 ? [newLabel(counts.new)] : []),
        ...(counts.similar > 0 ? [similarLabel(counts.similar)] : []),
      ];
      const found =
        asked.length > 0
          ? `De verificat: ${asked.join(' și ')}.`
          : 'Nimic nou: toate sunt deja în biblioteca ta.';
      const identical =
        asked.length > 0 && counts.identical > 0 ? ` ${counts.identical} deja în bibliotecă.` : '';
      const after = clientConfirmed ? '' : ' Le confirmi după client.';
      return `${found}${identical}${after}`;
    }
  }
}

const unreadReasons: Record<InstructionsProposalUnreadItem['reason'], string> = {
  file_not_found: 'fișierul ei nu este în import',
  start_not_found: 'nu am putut găsi textul în document',
  no_articles: 'nu am găsit niciun articol în textul ei',
  too_long: 'are mai mult de 400 de articole sau de 200.000 de caractere',
};

export const unreadReason = (reason: InstructionsProposalUnreadItem['reason']) =>
  unreadReasons[reason];

const endSentence = (text: string) => (/[.!?]$/u.test(text) ? text : `${text}.`);

function tableRowsLine(articles: readonly number[]) {
  const names = joinNames(
    articles.map((article, index) => `${index === 0 ? 'Art.' : 'art.'} ${article}`)
  );
  return articles.length === 1
    ? `${names} avea un tabel în document. L-am trecut ca text, cu celulele despărțite de o liniuță: verifică-l.`
    : `${names} aveau tabele în document. Le-am trecut ca text, cu celulele despărțite de o liniuță: verifică-le.`;
}

export function flagText(flag: ProposedInstruction['flags'][number]) {
  switch (flag.kind) {
    case 'no_numbering':
      return `${splitFlagMessages.no_numbering}: am făcut câte un articol din fiecare paragraf.`;
    case 'no_articles':
      return `${splitFlagMessages.no_articles}.`;
    case 'text_before_first_article':
      return `${splitFlagMessages.text_before_first_article}.`;
    case 'table_row':
      return tableRowsLine([flag.article]);
    case 'empty_article':
      return `Art. ${flag.number} din pachet nu are text, poate doar o imagine, și nu a fost preluat. Articolele de după el au aici numărul cu unu mai mic.`;
    case 'end_not_found':
      return 'Nu am găsit unde se termină: textul merge până unde începe instrucțiunea următoare.';
    case 'end_extended':
      return 'Sfârșitul citat apare și în interiorul instrucțiunii, așa că textul merge până la instrucțiunea următoare.';
    case 'client_name':
      return `Textul numește clientul ${endSentence(flag.name)} Instrucțiunea se aplică și altor clienți.`;
  }
}

// The splitter flags every table row; one line per instruction names the articles they went into.
export function flagLines(flags: readonly ProposedInstruction['flags'][number][]) {
  const rows = flags.flatMap((flag) => (flag.kind === 'table_row' ? [flag.article] : []));
  const articles = [...new Set(rows)];
  const lines = [...new Set(flags.filter((flag) => flag.kind !== 'table_row').map(flagText))];
  if (articles.length > 0) lines.unshift(tableRowsLine(articles));
  return lines;
}

export function undecidedReasons(
  position: ProposedPosition,
  titleOf: (key: string) => string | undefined
): string[] {
  if (position.resolution.kind === 'resolved') {
    return position.clientPost === null
      ? ['Postul din tematică nu se potrivește cu niciunul dintre posturile clientului.']
      : [];
  }
  const reasons = position.resolution.reasons.map((reason) => {
    switch (reason.kind) {
      case 'number_twice': {
        const where =
          reason.scope.kind === 'main'
            ? 'în document'
            : reason.scope.kind === 'own'
              ? `în I.P.S.S.M. ${reason.scope.number}`
              : `în ${reason.scope.file}`;
        return `Art. ${reason.number} apare de două ori ${where}, în instrucțiuni diferite.`;
      }
      case 'cuts_instruction': {
        const title = titleOf(reason.instruction);
        return title
          ? `Intervalul citat taie în două instrucțiunea „${title}”.`
          : 'Intervalul citat taie o instrucțiune în două.';
      }
      case 'number_shared':
        return `Art. ${reason.number} se găsește în mai multe instrucțiuni.`;
      case 'missing_reference':
        return `Tematica citează ${reason.reference}, care nu este în pachet.`;
      case 'unread_citation':
        return `Nu am putut citi citarea din tematică: „${reason.citation}”.`;
    }
  });
  return reasons.length > 0 ? reasons : ['Citarea din tematică nu ne-a spus ce instrucțiuni ia.'];
}

export function undecidedPositions(positions: readonly ProposedPosition[]) {
  return positions.filter(
    (position) => position.resolution.kind === 'undecided' || position.clientPost === null
  );
}

/** The posts an instruction can go on: once the client is confirmed, only those it kept. */
export const pickablePosts = (posts: readonly LibraryPost[], clientConfirmed: boolean) =>
  clientConfirmed ? posts.filter((post) => post.jobPositionId !== null) : [...posts];

/** A row names a post by its id or, once the client is confirmed, by its job position's. */
export function postsByReference(posts: readonly LibraryPost[]) {
  const byReference = new Map(posts.map((post) => [post.id, post]));
  for (const post of posts) {
    if (post.jobPositionId) byReference.set(post.jobPositionId, post);
  }
  return byReference;
}

export function joinNames(names: readonly string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} și ${names.at(-1)}`;
}

// The viewer marks a quote, not a range, so the cut is shown by where it starts.
export function sourceQuote(body: InstructionBody) {
  const first = body.blocks.find((block) => block.kind === 'article');
  const text = first?.kind === 'article' ? first.paragraphs[0]! : '';
  return text.split(/\s+/u).slice(0, 30).join(' ');
}

export type ConfirmSummary = { created: number; used: number; posts: number };

/** `posts` holds the posts confirming applies to, by `postsByReference`. */
export function confirmSummary(
  instructions: readonly ProposedInstruction[],
  changes: LibraryChanges,
  positionPosts: Record<string, string | null>,
  posts: ReadonlyMap<string, LibraryPost>
): ConfirmSummary {
  const summary = { created: 0, used: 0, posts: new Set<string>() };
  for (const instruction of instructions) {
    const row = rowState(instruction, changes.instructions[instruction.key], positionPosts);
    if (!row.included) continue;
    if (row.usesLibrary) summary.used += 1;
    else summary.created += 1;
    for (const reference of row.posts) {
      const post = posts.get(reference);
      if (post) summary.posts.add(post.id);
    }
  }
  return { created: summary.created, used: summary.used, posts: summary.posts.size };
}
