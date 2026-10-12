import {
  type BuiltInDocumentTypeKey,
  type DatedDocumentTypeKey,
  fireSafetyDocumentTitles,
  type FireSafetyTypeKeyFromTenEmployees,
  fireSafetyTypeKeysFromTenEmployees,
  isDatedDocumentType,
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
  fire_annual_report: 'Raportul anual de evaluare a nivelului de apărare împotriva incendiilor',
};

// The template titles, held to the fire-safety manifest by a test.
export const notGeneratedTitles: Partial<Record<BuiltInDocumentTypeKey, string>> =
  fireSafetyDocumentTitles;

// A dated type's row is named for its year (ADR 020): "Raport anual de evaluare 2026".
const datedLabels: Record<DatedDocumentTypeKey, string> = {
  fire_annual_report: 'Raport anual de evaluare',
};

const datedNames: Record<DatedDocumentTypeKey, string> = {
  fire_annual_report: 'raportul anual de evaluare',
};

export function datedTitle(document: Pick<ClientDocument, 'typeKey' | 'title' | 'period'>) {
  const label = isDatedDocumentType(document.typeKey) ? datedLabels[document.typeKey] : null;
  return `${label ?? document.title} ${document.period}`;
}

export function periodHint(typeKeys: readonly DatedDocumentTypeKey[]) {
  const names = typeKeys.map((typeKey) => datedNames[typeKey]);
  const listed =
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names.at(-1)}`;
  return `Anul pentru care se întocmește ${listed}; un alt an face un document nou.`;
}

/** Mirrors the API's `documentApplies`, which decides what a generation makes. */
export function appliesAt(typeKey: string, currentEmployeeCount: number) {
  if (typeKey === 'decision_workers_representative') {
    return requiredWorkersRepresentatives(currentEmployeeCount) > 0;
  }
  if ((fireSafetyTypeKeysFromTenEmployees as readonly string[]).includes(typeKey)) {
    return currentEmployeeCount >= 10;
  }
  return true;
}

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
  fire_annual_report: 'raportul anual de evaluare',
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
    // A dated type is made for every year asked, so it is always among those generated.
    const due = fireSafetyTypeKeysFromTenEmployees.filter(
      (typeKey) => isDatedDocumentType(typeKey) || !generatedTypeKeys.includes(typeKey)
    );
    return `${count}, așa că se generează și ${named(due)}.`;
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
