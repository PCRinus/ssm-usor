import type { ImportSourceResponse } from '@/api/generated/api';

import type { SpotBox } from '../spot-zoom';
import type { FieldName, SheetPage } from './employee-review-model';

type Locations = ImportSourceResponse['locations'];

const fieldTargets: Record<FieldName, string> = {
  lastName: 'person.name',
  firstName: 'person.name',
  cnp: 'person.cnp',
  employeeNumber: 'person.employeeNumber',
  birthDate: 'fields.birthDate',
  birthPlace: 'fields.birthPlace',
  homeAddress: 'fields.homeAddress',
  residenceAddress: 'fields.residenceAddress',
  education: 'fields.education',
  qualification: 'fields.qualification',
  bloodGroup: 'fields.bloodGroup',
  rhFactor: 'fields.rhFactor',
  jobTitle: 'fields.jobTitle',
  hiredAt: 'fields.hiredAt',
  leftOn: 'fields.leftOn',
  workplace: 'fields.workplace',
  commuteRoute: 'fields.commuteRoute',
  commuteMeans: 'fields.commuteMeans',
  commuteMinutes: 'fields.commuteMinutes',
};

export const fieldTarget = (name: FieldName) => fieldTargets[name];

// A page's rows keep the order of its reading, whose index names a row's box.
export function rowTarget(page: SheetPage, rowId: string) {
  const index = page.rows.findIndex((row) => row.id === rowId);
  return index === -1 ? null : `trainings[${index}]`;
}

export const admissionTarget = 'admission.admittedOn';

const wholeRow = /^trainings\[\d+\]$/;

// A row the locate request did not box whole is still found by the cells it boxed.
export function spotBox(locations: Locations, target: string | null): SpotBox | null {
  if (!locations || !target) return null;
  const own = locations.find((each) => each.target === target);
  if (own) return own;
  if (!wholeRow.test(target)) return null;
  const cells = locations.filter((each) => each.target.startsWith(`${target}.`));
  if (cells.length === 0) return null;
  return {
    top: Math.min(...cells.map((cell) => cell.top)),
    left: Math.min(...cells.map((cell) => cell.left)),
    bottom: Math.max(...cells.map((cell) => cell.bottom)),
    right: Math.max(...cells.map((cell) => cell.right)),
  };
}
