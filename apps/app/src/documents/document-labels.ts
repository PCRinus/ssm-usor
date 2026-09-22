import {
  type DocumentTypeKey,
  type MissingDocumentData,
  requiredWorkersRepresentatives,
} from '@ssm-usor/contracts';

import type { ClientDocumentListResponse } from '../api/generated/api';
import { responsibleRoleLabels } from '../document-data/responsible-person-schema';
import { employeeCountLabel } from '../job-positions/job-position-schema';

export type ClientDocument = ClientDocumentListResponse['items'][number];

// Where a missing piece of data is filled in. The form groups what is missing by place, so a
// person makes one trip to each page.
export type MissingPlace = 'organization' | 'profile' | 'client';

export const missingPlaces: Record<MissingPlace, { label: string; hint?: string }> = {
  organization: {
    label: 'Datele organizației',
    hint: 'Le completează proprietarul organizației.',
  },
  profile: { label: 'Profilul tău' },
  client: { label: 'Datele pentru documente ale clientului' },
};

export const missingDataLabels: Record<
  MissingDocumentData,
  { place: MissingPlace; label: string }
> = {
  'provider.legalName': { place: 'organization', label: 'denumirea legală' },
  'provider.representativeName': { place: 'organization', label: 'numele reprezentantului legal' },
  'provider.representativeRole': {
    place: 'organization',
    label: 'funcția reprezentantului legal',
  },
  'specialist.name': { place: 'profile', label: 'numele tău' },
  'specialist.professionalTitle': { place: 'profile', label: 'titlul profesional' },
  'client.representativeName': { place: 'client', label: 'numele reprezentantului legal' },
  'client.representativeRole': { place: 'client', label: 'funcția reprezentantului legal' },
  'client.trainingSchedule': { place: 'client', label: 'programul instruirilor periodice' },
  'responsible.workplace_manager': {
    place: 'client',
    label: `o persoană pentru „${responsibleRoleLabels.workplace_manager.label}”`,
  },
  'responsible.first_aid': {
    place: 'client',
    label: `o persoană pentru „${responsibleRoleLabels.first_aid.label}”`,
  },
  'responsible.risk_evaluation_team': {
    place: 'client',
    label: `o persoană pentru „${responsibleRoleLabels.risk_evaluation_team.label}”`,
  },
  'responsible.imminent_danger': {
    place: 'client',
    label: `o persoană pentru „${responsibleRoleLabels.imminent_danger.label}”`,
  },
  'responsible.workers_representative': {
    place: 'client',
    label:
      'un reprezentant al lucrătorilor, ales dintre angajați (clientul are cel puțin 10 angajați)',
  },
  'responsible.workers_representatives_two': {
    place: 'client',
    label: 'al doilea reprezentant al lucrătorilor (clientul are cel puțin 50 de angajați)',
  },
  'responsible.workers_representative_is_legal_representative': {
    place: 'client',
    label:
      'alt reprezentant al lucrătorilor: reprezentantul legal al clientului nu îi poate reprezenta și pe lucrători',
  },
};

export type WorkersRepresentativeClash = {
  representativeName: string;
  legalRepresentativeName: string;
};

export function groupMissing(
  missing: readonly MissingDocumentData[],
  clash: WorkersRepresentativeClash | null = null
) {
  const label = (code: MissingDocumentData) =>
    code === 'responsible.workers_representative_is_legal_representative' && clash
      ? `alt reprezentant al lucrătorilor: „${clash.representativeName}” are același nume ca reprezentantul legal al clientului, „${clash.legalRepresentativeName}”`
      : missingDataLabels[code].label;
  const places: MissingPlace[] = ['organization', 'profile', 'client'];
  return places
    .map((place) => ({
      place,
      labels: missing.filter((code) => missingDataLabels[code].place === place).map(label),
    }))
    .filter((group) => group.labels.length > 0);
}

// The API names a document only once it exists; one that does not apply is named here.
export const notApplicableTitles: Partial<Record<DocumentTypeKey, string>> = {
  decision_workers_representative: 'Decizia privind reprezentanții lucrătorilor',
};

/** What the employee count means for decision 1.5, said where documents are generated. */
export function workersRepresentativesRule(currentEmployeeCount: number, generated: boolean) {
  const count = `${employeeCountLabel(currentEmployeeCount)} în lista clientului`;
  const needed = requiredWorkersRepresentatives(currentEmployeeCount);
  if (needed === 0) {
    return generated
      ? `${count}. Decizia privind reprezentanții lucrătorilor este deja generată și rămâne în documentație, deși este necesară doar de la 10 angajați.`
      : `${count}, așa că decizia privind reprezentanții lucrătorilor nu se generează. Este necesară de la 10 angajați.`;
  }
  if (generated) {
    const representatives =
      needed === 1 ? 'un reprezentant al lucrătorilor' : 'doi reprezentanți ai lucrătorilor';
    return `${count}, așa că este nevoie de cel puțin ${representatives}. Decizia privind reprezentanții lucrătorilor este deja generată.`;
  }
  return `${count}, așa că se generează și decizia privind reprezentanții lucrătorilor, cu cel puțin ${needed === 1 ? 'un reprezentant' : 'doi reprezentanți'}.`;
}
