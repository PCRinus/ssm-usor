import {
  type DocumentGroup,
  type DocumentSet,
  documentSetGroups,
  documentSets,
  type MissingDocumentData,
} from '@ssm-usor/contracts';

import {
  buildPartialDocumentContext,
  documentData,
  type DocumentFacts,
  documentGapConcerns,
  missingDocumentData,
  type SsmSetFacts,
} from './context';
import type { FireStoredFacts, SsmStoredFacts, StoredDocumentFacts } from './facts';
import {
  buildPartialFireSafetyContext,
  fireSafetyDocumentData,
  fireSafetyGapConcerns,
  type FireSafetySetFacts,
  missingFireSafetyData,
} from './fire-safety';
import type { OwnInstructionsRevision } from './themes';

/** The training themes cite the set's own instructions (ADR 014). */
export type ThemesRule<Stored> = {
  typeKey: string;
  cites: 'own_instructions' | 'fire_own_instructions';
  cited: (facts: Stored) => OwnInstructionsRevision | null;
  citing: (facts: Stored, revision: OwnInstructionsRevision | null) => Stored;
};

type SetRules<Facts, Stored> = {
  missing: (facts: Facts, typeKey?: string) => MissingDocumentData[];
  concerns: (code: MissingDocumentData, printedNames: readonly string[]) => boolean;
  /**
   * What the gaps of `missing(facts, typeKey)` cover is left out of the data, and with `only`, the
   * context's parts not named there.
   */
  data: (
    facts: Facts,
    typeKey: string,
    decisionNumber: number | null,
    only?: ReadonlySet<string>
  ) => Record<string, unknown>;
  themes: ThemesRule<Stored>;
};

export const setRules: {
  occupational_safety: SetRules<SsmSetFacts, SsmStoredFacts>;
  fire_safety: SetRules<FireSafetySetFacts, FireStoredFacts>;
} = {
  occupational_safety: {
    missing: missingDocumentData,
    concerns: documentGapConcerns,
    data: (facts, typeKey, decisionNumber, only) =>
      documentData(buildPartialDocumentContext(facts, typeKey, only), typeKey, decisionNumber),
    themes: {
      typeKey: 'training_themes',
      cites: 'own_instructions',
      cited: (facts) => facts.ownInstructions,
      citing: (facts, ownInstructions) => ({ ...facts, ownInstructions }),
    },
  },
  fire_safety: {
    missing: missingFireSafetyData,
    concerns: fireSafetyGapConcerns,
    data: (facts, typeKey, _decisionNumber, only) =>
      fireSafetyDocumentData(buildPartialFireSafetyContext(facts, typeKey, only), typeKey),
    themes: {
      typeKey: 'fire_training_themes',
      cites: 'fire_own_instructions',
      cited: (facts) => facts.fireOwnInstructions,
      citing: (facts, fireOwnInstructions) => ({ ...facts, fireOwnInstructions }),
    },
  },
};

type AskedFacts = Pick<DocumentFacts, 'issueDate' | 'firstDecisionNumber' | 'period'>;

type BoundSetRules = {
  missing: (typeKey?: string) => MissingDocumentData[];
  concerns: (code: MissingDocumentData, printedNames: readonly string[]) => boolean;
  data: (typeKey: string, decisionNumber: number | null) => Record<string, unknown>;
  printedData: (
    typeKey: string,
    decisionNumber: number | null,
    printedNames: readonly string[]
  ) => Record<string, unknown>;
};

// A test prints its questions under names of their own, `test` and `questions`, drawn from this
// part of the context.
const derivedFrom = ['knowledgeTests'];

const bound = <Facts>(
  rules: Omit<SetRules<Facts, never>, 'themes'>,
  facts: Facts
): BoundSetRules => ({
  missing: (typeKey) => rules.missing(facts, typeKey),
  concerns: rules.concerns,
  data: (typeKey, decisionNumber) => rules.data(facts, typeKey, decisionNumber),
  printedData: (typeKey, decisionNumber, printedNames) =>
    rules.data(facts, typeKey, decisionNumber, new Set([...printedNames, ...derivedFrom])),
});

export const rulesOf = (facts: StoredDocumentFacts, asked: AskedFacts): BoundSetRules =>
  facts.set === 'fire_safety'
    ? bound(setRules.fire_safety, { ...facts, ...asked })
    : bound(setRules.occupational_safety, { ...facts, ...asked });

/** Null for the other documents, such as the service contract, which no set holds. */
export function setOfGroup(group: DocumentGroup): DocumentSet | null {
  return documentSets.find((set) => documentSetGroups[set] === group) ?? null;
}
