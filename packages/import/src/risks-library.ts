import {
  foldText,
  type PreventionMeasureKind,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';

export interface LibraryRiskFactor {
  id: string;
  component: WorkSystemComponent;
  description: string;
  gravityClass: number;
  probabilityClass: number;
  measures: readonly { kind: PreventionMeasureKind; description: string }[];
}

export interface LibraryEvaluation {
  id: string;
  name: string;
  factors: readonly LibraryRiskFactor[];
}

export interface PackRiskFactor {
  key: string;
  component: WorkSystemComponent | null;
  description: string;
  gravityClass: number | null;
  probabilityClass: number | null;
  measures: readonly { kind: PreventionMeasureKind; description: string }[];
}

export interface PackRiskSheet {
  key: string;
  name: string;
  factors: readonly PackRiskFactor[];
}

export type RiskLibraryStatus = 'identical' | 'similar' | 'new';

export interface RiskFactorPair {
  factor: string;
  libraryFactor: string;
  // Word-trigram Jaccard of the folded descriptions.
  similarity: number;
  otherClasses: boolean;
  otherMeasures: boolean;
}

export interface RiskLibraryMatch {
  evaluationId: string;
  name: string;
  // The share of the pack's factors paired with one of the entry's.
  share: number;
  pairs: RiskFactorPair[];
  // "Ce diferă": the factors only in the pack, and only in the library entry.
  onlyInPack: string[];
  onlyInLibrary: string[];
}

export interface ComparedRiskSheet {
  key: string;
  status: RiskLibraryStatus;
  match: RiskLibraryMatch | null;
  // The name a new entry would take: the client's name follows one the library already has.
  name: string;
  // Sheets of the pack identical to this one, which make no entry of their own.
  sameAs: string[];
}

// ADR 036. On the five reference archives, the nearest unrelated posts (office posts of two
// clients sharing the provider's own factors) pair 0.46 to 0.53 of their factors.
export const similarShare = 0.7;
export const similarDescription = 0.8;

const wordsOf = (text: string) => foldText(text).split(' ').filter(Boolean);

export function descriptionTrigrams(text: string) {
  const words = wordsOf(text);
  if (words.length < 3) return new Set([words.join(' ')]);
  const set = new Set<string>();
  for (let index = 0; index + 2 < words.length; index++) {
    set.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
  }
  return set;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

type Comparable = Pick<
  PackRiskFactor,
  'component' | 'description' | 'gravityClass' | 'probabilityClass' | 'measures'
>;

const identityOf = (factor: Comparable) =>
  [
    factor.component,
    foldText(factor.description),
    factor.gravityClass,
    factor.probabilityClass,
  ].join('|');

const signatureOf = (factors: readonly Comparable[]) => factors.map(identityOf).sort().join('\n');

const measuresKey = (factor: Comparable) =>
  factor.measures
    .map((measure) => `${measure.kind}:${foldText(measure.description)}`)
    .sort()
    .join('\n');

function pairUp(
  pack: readonly PackRiskFactor[],
  entry: LibraryEvaluation,
  threshold: number
): RiskLibraryMatch {
  const libraryTrigrams = entry.factors.map((factor) => descriptionTrigrams(factor.description));
  const candidates: { pack: number; library: number; similarity: number }[] = [];
  pack.forEach((factor, packIndex) => {
    const own = descriptionTrigrams(factor.description);
    entry.factors.forEach((libraryFactor, libraryIndex) => {
      if (libraryFactor.component !== factor.component) return;
      const similarity = jaccard(own, libraryTrigrams[libraryIndex]!);
      if (similarity >= threshold) {
        candidates.push({ pack: packIndex, library: libraryIndex, similarity });
      }
    });
  });
  candidates.sort(
    (a, b) => b.similarity - a.similarity || a.pack - b.pack || a.library - b.library
  );
  const usedPack = new Set<number>();
  const usedLibrary = new Set<number>();
  const pairs: RiskFactorPair[] = [];
  for (const candidate of candidates) {
    if (usedPack.has(candidate.pack) || usedLibrary.has(candidate.library)) continue;
    usedPack.add(candidate.pack);
    usedLibrary.add(candidate.library);
    const factor = pack[candidate.pack]!;
    const libraryFactor = entry.factors[candidate.library]!;
    pairs.push({
      factor: factor.key,
      libraryFactor: libraryFactor.id,
      similarity: candidate.similarity,
      otherClasses:
        factor.gravityClass !== libraryFactor.gravityClass ||
        factor.probabilityClass !== libraryFactor.probabilityClass,
      otherMeasures: measuresKey(factor) !== measuresKey(libraryFactor),
    });
  }
  pairs.sort(
    (a, b) =>
      pack.findIndex((factor) => factor.key === a.factor) -
      pack.findIndex((factor) => factor.key === b.factor)
  );
  return {
    evaluationId: entry.id,
    name: entry.name,
    share: pack.length === 0 ? 0 : pairs.length / pack.length,
    pairs,
    onlyInPack: pack.filter((_, index) => !usedPack.has(index)).map((factor) => factor.key),
    onlyInLibrary: entry.factors
      .filter((_, index) => !usedLibrary.has(index))
      .map((factor) => factor.id),
  };
}

function identicalPairs(pack: readonly PackRiskFactor[], entry: LibraryEvaluation) {
  const free = new Map<string, LibraryRiskFactor[]>();
  for (const factor of entry.factors) {
    const key = identityOf(factor);
    free.set(key, [...(free.get(key) ?? []), factor]);
  }
  return pack.map((factor): RiskFactorPair => {
    const libraryFactor = free.get(identityOf(factor))!.shift()!;
    return {
      factor: factor.key,
      libraryFactor: libraryFactor.id,
      similarity: 1,
      otherClasses: false,
      otherMeasures: measuresKey(factor) !== measuresKey(libraryFactor),
    };
  });
}

// Within the database's 160 characters of a name: the client's name cut to 60, then the name.
export function freeName(name: string, clientName: string, taken: ReadonlySet<string>, max = 160) {
  if (!taken.has(foldText(name))) return name;
  const client = clientName.trim().slice(0, 60).trim();
  const within = (suffix: string) =>
    `${name.slice(0, Math.max(0, max - suffix.length)).trim()}${suffix}`;
  let candidate = within(` (${client})`);
  for (let number = 2; taken.has(foldText(candidate)); number++) {
    candidate = within(` (${client}) ${number}`);
  }
  return candidate;
}

export interface CompareRisksInput {
  sheets: readonly PackRiskSheet[];
  // The organization's active entries; archived ones are not compared (ADR 036).
  library: readonly LibraryEvaluation[];
  // Every entry's name, archived ones included: names stay unique across both.
  takenNames: readonly string[];
  clientName: string;
  thresholds?: { share: number; description: number };
}

export function compareRiskSheets(input: CompareRisksInput): ComparedRiskSheet[] {
  const share = input.thresholds?.share ?? similarShare;
  const description = input.thresholds?.description ?? similarDescription;
  const taken = new Set(input.takenNames.map(foldText));
  const signatures = new Map(input.library.map((entry) => [entry.id, signatureOf(entry.factors)]));
  const kept = new Map<string, ComparedRiskSheet>();
  const compared: ComparedRiskSheet[] = [];
  for (const sheet of input.sheets) {
    const signature = signatureOf(sheet.factors);
    const same = sheet.factors.length > 0 ? kept.get(signature) : undefined;
    if (same) {
      same.sameAs.push(sheet.key);
      continue;
    }
    const identical =
      sheet.factors.length > 0
        ? input.library.find((entry) => signatures.get(entry.id) === signature)
        : undefined;
    let result: ComparedRiskSheet;
    if (identical) {
      result = {
        key: sheet.key,
        status: 'identical',
        name: identical.name,
        sameAs: [],
        match: {
          evaluationId: identical.id,
          name: identical.name,
          share: 1,
          pairs: identicalPairs(sheet.factors, identical),
          onlyInPack: [],
          onlyInLibrary: [],
        },
      };
    } else {
      const best = input.library
        .map((entry) => pairUp(sheet.factors, entry, description))
        .sort(
          (a, b) =>
            b.share - a.share ||
            b.pairs.reduce((sum, pair) => sum + pair.similarity, 0) -
              a.pairs.reduce((sum, pair) => sum + pair.similarity, 0)
        )[0];
      const name = freeName(sheet.name, input.clientName, taken);
      taken.add(foldText(name));
      result =
        best && sheet.factors.length > 0 && best.share >= share
          ? { key: sheet.key, status: 'similar', name, sameAs: [], match: best }
          : { key: sheet.key, status: 'new', name, sameAs: [], match: null };
    }
    if (sheet.factors.length > 0) kept.set(signature, result);
    compared.push(result);
  }
  return compared;
}
