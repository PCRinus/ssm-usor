import { type DocumentTypeKey, requiredWorkersRepresentatives } from '@ssm-usor/contracts';

import type { ClientDocumentListResponse } from '../api/generated/api';
import { employeeCountLabel } from '../job-positions/job-position-schema';

export type ClientDocument = ClientDocumentListResponse['items'][number];

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
