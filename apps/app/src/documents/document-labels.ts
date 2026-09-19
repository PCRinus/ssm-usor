import type { MissingDocumentData } from '@ssm-usor/contracts';

import type { ClientDocumentListResponse } from '../api/generated/api';
import { responsibleRoleLabels } from '../document-data/responsible-person-schema';

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
};

export function groupMissing(missing: readonly MissingDocumentData[]) {
  const places: MissingPlace[] = ['organization', 'profile', 'client'];
  return places
    .map((place) => ({
      place,
      labels: missing
        .filter((code) => missingDataLabels[code].place === place)
        .map((code) => missingDataLabels[code].label),
    }))
    .filter((group) => group.labels.length > 0);
}
