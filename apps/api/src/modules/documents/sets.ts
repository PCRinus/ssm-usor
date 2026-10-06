import {
  type DocumentGroup,
  type DocumentSet,
  documentSetGroups,
  documentSets,
  type MissingDocumentData,
} from '@ssm-usor/contracts';

import {
  buildDocumentContext,
  documentData,
  type DocumentFacts,
  missingDataConcerns,
  missingDocumentData,
} from './context';
import {
  buildFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from './fire-safety';

type SetRules = {
  missing: (facts: DocumentFacts, typeKey?: string) => MissingDocumentData[];
  concerns: (code: MissingDocumentData, typeKey: string, printedNames: string[]) => boolean;
  data: (
    facts: DocumentFacts,
    typeKey: string,
    decisionNumber: number | null
  ) => Record<string, unknown>;
};

export const setRules: Record<DocumentSet, SetRules> = {
  occupational_safety: {
    missing: missingDocumentData,
    concerns: (code, typeKey) => missingDataConcerns(code, typeKey),
    data: (facts, typeKey, decisionNumber) =>
      documentData(buildDocumentContext(facts), typeKey, decisionNumber),
  },
  fire_safety: {
    missing: (facts) => missingFireSafetyData(facts),
    concerns: (code, _typeKey, printedNames) => fireSafetyGapConcerns(code, printedNames),
    data: (facts) => ({ ...buildFireSafetyContext(facts) }),
  },
};

/** Null for the other documents, such as the service contract, which no set holds. */
export function setOfGroup(group: DocumentGroup): DocumentSet | null {
  return documentSets.find((set) => documentSetGroups[set] === group) ?? null;
}
