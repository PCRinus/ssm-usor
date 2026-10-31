import { findQuote, foldText } from './match';
import type { Option, Proposal, Source } from './proposal';

// A legal form's initials and the trade's acronyms stay capitals inside a sentence.
const capitalWords = new Set([
  'SRL',
  'SSM',
  'PSI',
  'SU',
  'ISU',
  'ITM',
  'EIP',
  'IPSSM',
  'IPSU',
  'SEPP',
  'CAEN',
  'GPL',
  'PVC',
  'HACCP',
  'UPS',
  'PC',
  'IT',
  'TV',
]);
const initials = /^(?:\p{Lu}\.){2,}$/u;

export function allCapitals(value: string) {
  return (value.match(/\p{L}/gu)?.length ?? 0) >= 4 && value === value.toUpperCase();
}

function keptCapitals(word: string) {
  const bare = word.replace(/^\P{L}+/u, '').replace(/[^\p{L}.]+$/u, '');
  return initials.test(bare) || capitalWords.has(bare.replace(/\.$/, ''));
}

export function sentenceCase(value: string) {
  return value
    .split(/(\s+)/)
    .map((part) => (keptCapitals(part) ? part : part.toLowerCase()))
    .join('')
    .replace(
      /(^|[.:]\s+|\n)([\s"„'«(•*–-]*)(\p{Ll})/gu,
      (match, before: string, marks: string, first: string, offset: number, whole: string) =>
        before.startsWith('.') &&
        initials.test(
          whole
            .slice(0, offset + 1)
            .split(/\s/)
            .at(-1)!
        )
          ? match
          : before + marks + first.toUpperCase()
    );
}

const words = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function writtenIn(sources: Source[], value: string) {
  for (const { quote } of sources) {
    const match = findQuote(quote, value);
    if (match) return quote.slice(match.start, match.end);
  }
  return null;
}

export interface Spelled {
  value: string;
  // How the document writes the value, when only its capitals or diacritics differ.
  spelling: string | null;
}

// Capitals are corrected here; diacritics the reading model writes, so the document's spelling of
// a value it gave them is the quote's.
export function correctSpelling(
  value: string,
  sources: Source[],
  { diacritics = true } = {}
): Spelled {
  const capitals = allCapitals(value);
  const corrected = capitals ? sentenceCase(value) : value;
  const written = writtenIn(sources, value);
  const spelling = capitals
    ? (written ?? value)
    : diacritics && written !== null && words(written).toLowerCase() !== words(value).toLowerCase()
      ? written
      : null;
  const kept =
    spelling !== null &&
    words(spelling) !== words(corrected) &&
    foldText(spelling) === foldText(corrected);
  return { value: corrected, spelling: kept ? spelling : null };
}

function correctKinds(value: string, sources: Source[]): Spelled {
  const kinds = value.split(/\s*;\s*/).map((kind) => correctSpelling(kind, sources));
  const spelled = kinds.some((kind) => kind.spelling !== null);
  return {
    value: kinds.map((kind) => kind.value).join('; '),
    spelling: spelled ? kinds.map((kind) => kind.spelling ?? kind.value).join('; ') : null,
  };
}

function correctOptions(
  options: Option<string | number>[],
  correct: (value: string, sources: Source[]) => Spelled
) {
  for (const option of options) {
    if (typeof option.value !== 'string') continue;
    const { value, spelling } = correct(option.value, option.sources);
    option.value = value;
    if (spelling !== null) option.spelling = spelling;
  }
}

interface Item {
  sources: Source[];
  spelling: Record<string, string>;
}

function correctValue<T extends Item>(item: T, field: keyof T & string, sources = item.sources) {
  const values = item as unknown as Record<string, unknown>;
  const written = values[field];
  if (typeof written !== 'string') return;
  const { value, spelling } = correctSpelling(written, sources);
  values[field] = value;
  if (spelling !== null) item.spelling[field] = spelling;
}

const workplaceTexts = [
  'name',
  'activity',
  'assemblyPoint',
  'combustibleMaterials',
  'ignitionSources',
  'fireRiskEquipment',
  'specificMeasures',
] as const;

// Names of people and companies, identifiers and addresses stay as the documents write them.
export function correctProposalSpelling(proposal: Proposal) {
  correctOptions(proposal.client.legalRepresentativeRole.options, (value, sources) =>
    correctSpelling(value, sources, { diacritics: false })
  );
  correctOptions(proposal.fireSafety.smokingPlace.options, correctSpelling);
  correctOptions(proposal.fireSafety.wasteCollectors.options, correctSpelling);
  correctOptions(proposal.fireSafety.wasteKinds.options, correctKinds);
  for (const workplace of proposal.workplaces) {
    for (const field of workplaceTexts) {
      correctValue(workplace, field, [
        ...(workplace.fieldSources[field] ?? []),
        ...workplace.sources,
      ]);
    }
    // Confirming writes no room of the workplace's own, so there is no spelling of one to keep.
    workplace.rooms = workplace.rooms.map((room) => correctSpelling(room, workplace.sources).value);
  }
  for (const position of proposal.jobPositions) {
    correctValue(position, 'name');
    correctValue(position, 'workZone');
    correctValue(position, 'activities', [
      ...(position.fieldSources.activities ?? []),
      ...position.sources,
    ]);
  }
  for (const entry of proposal.protectiveEquipment) {
    correctValue(entry, 'item');
    correctValue(entry, 'risk');
  }
  for (const equipment of proposal.fireEquipment) correctValue(equipment, 'room');
  return proposal;
}
