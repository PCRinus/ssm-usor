import {
  type BuiltInDocumentTypeKey,
  type FireSafetyTypeKeyFromTenEmployees,
  fireSafetyTypeKeysFromTenEmployees,
  requiredWorkersRepresentatives,
} from '@ssm-usor/contracts';

import type { ClientDocumentListResponse } from '@/api/generated/api';
import { employeeCountLabel } from '@/features/job-positions/job-position-schema';

export type ClientDocument = ClientDocumentListResponse['items'][number];

// The API names a document only once it exists; one that does not apply, and one of a set listed
// whole that is not generated yet, are named here.
export const notApplicableTitles: Partial<Record<BuiltInDocumentTypeKey, string>> = {
  decision_workers_representative: 'Decizia privind reprezentanții lucrătorilor',
  fire_decision_seasons: 'Decizia privind perioadele caniculare și sezonul rece',
  fire_decision_control: 'Decizia privind controlul propriu',
  fire_maintenance_schedules: 'Graficele de întreținere și verificare',
  fire_installation_register:
    'Registru de control pentru instalațiile de apărare împotriva incendiilor',
  fire_site_sheet: 'Fișa obiectivului',
};

// The template titles, held to the fire-safety manifest by a test.
export const notGeneratedTitles: Partial<Record<BuiltInDocumentTypeKey, string>> = {
  fire_cover_decisions: 'Copertă – Deciziile interne în domeniul situațiilor de urgență',
  fire_decision_organization: 'Decizia privind organizarea apărării împotriva incendiilor',
  fire_decision_training: 'Decizia privind instruirea în domeniul situațiilor de urgență',
  fire_decision_open_fire: 'Decizia privind lucrul cu foc deschis',
  fire_decision_smoking: 'Decizia privind fumatul',
  fire_decision_technician: 'Decizia privind cadrul tehnic PSI',
  fire_decision_instructions: 'Decizia privind instrucțiunile de apărare împotriva incendiilor',
  fire_decision_waste: 'Decizia privind colectarea deșeurilor',
  fire_decision_seasons: 'Decizia privind perioadele caniculare și sezonul rece',
  fire_decision_control: 'Decizia privind controlul propriu',
  fire_cover_own_instructions:
    'Copertă – Instrucțiunile proprii în domeniul situațiilor de urgență',
  fire_own_instructions: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
  fire_cover_training_themes: 'Copertă – Tematica de instruire în domeniul situațiilor de urgență',
  fire_training_themes: 'Tematica de instruire în domeniul situațiilor de urgență',
  fire_cover_tests: 'Copertă – Testele de verificare a cunoștințelor',
  fire_test_hiring: 'Test la angajare',
  fire_test_annual: 'Test anual',
  fire_means_list: 'Lista mijloacelor de apărare împotriva incendiilor',
  fire_workplace_organization: 'Organizarea apărării împotriva incendiilor la locul de muncă',
  fire_substances_list: 'Lista substanțelor periculoase',
  fire_maintenance_schedules: 'Graficele de întreținere și verificare',
  fire_cover_registers: 'Copertă – Registrele de evidență în domeniul situațiilor de urgență',
  fire_registers:
    'Evidența exercițiilor de intervenție, a controalelor și a permiselor de lucru cu foc',
  fire_work_permit: 'Permis de lucru cu foc',
  fire_installation_register:
    'Registru de control pentru instalațiile de apărare împotriva incendiilor',
  fire_extinguisher_register: 'Registru de evidență a controlului stingătoarelor de incendiu',
  fire_site_sheet: 'Fișa obiectivului',
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

const fromTenEmployeesNames: Record<FireSafetyTypeKeyFromTenEmployees, string> = {
  fire_decision_seasons: 'decizia privind perioadele caniculare și sezonul rece',
  fire_decision_control: 'decizia privind controlul propriu',
  fire_maintenance_schedules: 'graficele de întreținere și verificare',
  fire_installation_register: 'registrul de control pentru instalații',
  fire_site_sheet: 'fișa obiectivului',
};

function named(typeKeys: readonly FireSafetyTypeKeyFromTenEmployees[]) {
  const names = typeKeys.map((typeKey) => fromTenEmployeesNames[typeKey]);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names.at(-1)}`;
}

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);

/**
 * What the employee count means for the fire-safety documents required from ten employees
 * (ADR 020), said where documents are generated and on the rows that do not apply.
 */
export function fireSafetyHeadcountRule(
  currentEmployeeCount: number,
  generatedTypeKeys: readonly string[]
) {
  const count = `${employeeCountLabel(currentEmployeeCount)} în lista clientului`;
  const generated = fireSafetyTypeKeysFromTenEmployees.filter((typeKey) =>
    generatedTypeKeys.includes(typeKey)
  );
  const lacking = fireSafetyTypeKeysFromTenEmployees.filter(
    (typeKey) => !generatedTypeKeys.includes(typeKey)
  );
  if (currentEmployeeCount >= 10) {
    return lacking.length > 0
      ? `${count}, așa că se generează și ${named(lacking)}.`
      : `${count}. ${sentence(named(generated))} există deja în documentație.`;
  }
  // "Graficele" is a plural noun, so it takes the plural verb even alone.
  const one = (
    typeKeys: readonly FireSafetyTypeKeyFromTenEmployees[],
    singular: string,
    plural: string
  ) => (typeKeys.length === 1 && typeKeys[0] !== 'fire_maintenance_schedules' ? singular : plural);
  const kept =
    generated.length > 0
      ? ` ${sentence(named(generated))} există deja și ${one(generated, 'rămâne', 'rămân')} în documentație, deși ${one(generated, 'se cere', 'se cer')} doar de la 10 angajați.`
      : '';
  return lacking.length > 0
    ? `${count}, așa că ${named(lacking)} nu se generează. ${one(lacking, 'Se cere', 'Se cer')} de la 10 angajați.${kept}`
    : `${count}.${kept}`;
}
