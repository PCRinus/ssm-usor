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
} from './context';
import {
  buildPartialFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from './fire-safety';

type SetRules = {
  missing: (facts: DocumentFacts, typeKey?: string) => MissingDocumentData[];
  concerns: (code: MissingDocumentData, printedNames: readonly string[]) => boolean;
  /**
   * With `buildsWithGaps`, what the gaps of `missing(facts, typeKey)` cover is left out of the
   * data; without it, any gap throws.
   */
  data: (
    facts: DocumentFacts,
    typeKey: string,
    decisionNumber: number | null
  ) => Record<string, unknown>;
  buildsWithGaps: boolean;
};

export const setRules: Record<DocumentSet, SetRules> = {
  occupational_safety: {
    missing: missingDocumentData,
    concerns: documentGapConcerns,
    data: (facts, typeKey, decisionNumber) =>
      documentData(buildPartialDocumentContext(facts, typeKey), typeKey, decisionNumber),
    buildsWithGaps: true,
  },
  fire_safety: {
    missing: (facts) => missingFireSafetyData(facts),
    concerns: fireSafetyGapConcerns,
    data: (facts) => ({ ...buildPartialFireSafetyContext(facts) }),
    buildsWithGaps: true,
  },
};

/** Null for the other documents, such as the service contract, which no set holds. */
export function setOfGroup(group: DocumentGroup): DocumentSet | null {
  return documentSets.find((set) => documentSetGroups[set] === group) ?? null;
}
