import { type BuiltInDocumentTypeKey, requiredWorkersRepresentatives } from '@ssm-usor/contracts';

import type { ClientDocumentListResponse } from '@/api/generated/api';
import { employeeCountLabel } from '@/features/job-positions/job-position-schema';

export type ClientDocument = ClientDocumentListResponse['items'][number];

// The API names a document only once it exists; one that does not apply, and one of a set listed
// whole that is not generated yet, are named here.
export const notApplicableTitles: Partial<Record<BuiltInDocumentTypeKey, string>> = {
  decision_workers_representative: 'Decizia privind reprezentanții lucrătorilor',
};

// The template titles, held to the fire-safety manifest by a test.
export const notGeneratedTitles: Partial<Record<BuiltInDocumentTypeKey, string>> = {
  fire_cover_registers: 'Copertă – Registrele de evidență în domeniul situațiilor de urgență',
  fire_registers:
    'Evidența exercițiilor de intervenție, a controalelor și a permiselor de lucru cu foc',
  fire_work_permit: 'Permis de lucru cu foc',
  fire_installation_register:
    'Registru de control pentru instalațiile de apărare împotriva incendiilor',
  fire_extinguisher_register: 'Registru de evidență a controlului stingătoarelor de incendiu',
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
