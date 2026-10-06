import { fireSafetyMissingDocumentData } from '@ssm-usor/contracts';

import { type DocumentFacts, printedDate } from './context';

type FireSafetyMissingData = (typeof fireSafetyMissingDocumentData)[number];

/**
 * What every fire-safety template is merged with (ADR 016). Never the occupational safety
 * set's names: a snapshot keeps the whole value of a name a template printed, so a
 * `positions` here would mark fire-safety drafts as changed by a protective-equipment edit.
 */
export type FireSafetyContext = {
  branding: boolean;
  issueDate: string;
  client: { legalName: string; representativeName: string; representativeRole: string };
  provider: { legalName: string; representativeName: string; representativeRole: string };
  fireSafetyTechnician: { name: string };
};

export type FireSafetyFacts = Pick<
  DocumentFacts,
  'issueDate' | 'branding' | 'organization' | 'client'
>;

const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function missingFireSafetyData(
  facts: Pick<DocumentFacts, 'organization' | 'client'>
): FireSafetyMissingData[] {
  const present: Record<FireSafetyMissingData, boolean> = {
    'provider.legalName': filled(facts.organization.legalName),
    'provider.fireSafetyTechnician': filled(facts.organization.fireSafetyTechnicianName),
    'client.representativeName': filled(facts.client.representativeName),
    'client.representativeRole': filled(facts.client.representativeRole),
  };
  return fireSafetyMissingDocumentData.filter((code) => !present[code]);
}

const printedAs: Record<FireSafetyMissingData, keyof FireSafetyContext> = {
  'provider.legalName': 'provider',
  'provider.fireSafetyTechnician': 'fireSafetyTechnician',
  'client.representativeName': 'client',
  'client.representativeRole': 'client',
};

/** Whether a gap is in a name the document printed, which its snapshot keeps. */
export function fireSafetyGapConcerns(code: string, printedNames: readonly string[]) {
  const name = printedAs[code as FireSafetyMissingData];
  return name === undefined || printedNames.includes(name);
}

/**
 * Call `missingFireSafetyData` first: this throws when something is missing. The provider's
 * representative is not asked for, since no fire-safety document prints it; the provider keeps
 * the shape the occupational safety set gives it, with an empty name where none is stored.
 */
export function buildFireSafetyContext(facts: FireSafetyFacts): FireSafetyContext {
  const missing = missingFireSafetyData(facts);
  if (missing.length > 0) throw new Error(`Missing document data: ${missing.join(', ')}`);
  const { organization, client } = facts;
  return {
    branding: facts.branding,
    issueDate: printedDate(facts.issueDate),
    client: {
      legalName: client.legalName.trim(),
      representativeName: client.representativeName!.trim(),
      representativeRole: client.representativeRole!.trim(),
    },
    provider: {
      legalName: organization.legalName!.trim(),
      representativeName: organization.representativeName?.trim() ?? '',
      representativeRole: organization.representativeRole?.trim() ?? '',
    },
    fireSafetyTechnician: { name: organization.fireSafetyTechnicianName!.trim() },
  };
}
