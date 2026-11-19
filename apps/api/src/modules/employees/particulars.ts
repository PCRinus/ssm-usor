import { type BloodGroup, orderedCommuteMeans, type RhFactor } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

// No CNP here: the portal reads these with the secret key and must never select it.
export const particularsColumns =
  'birth_date, birth_place, home_address, blood_group, rh_factor, qualification, education, authorizations, commute_route, commute_means, commute_means_other, commute_minutes';

type ParticularsRow = Pick<
  Database['public']['Tables']['employees']['Row'],
  | 'birth_date'
  | 'birth_place'
  | 'home_address'
  | 'blood_group'
  | 'rh_factor'
  | 'qualification'
  | 'education'
  | 'authorizations'
  | 'commute_route'
  | 'commute_means'
  | 'commute_means_other'
  | 'commute_minutes'
>;

export function toParticulars(row: ParticularsRow) {
  return {
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    homeAddress: row.home_address,
    // The database constrains both to the shared lists.
    bloodGroup: row.blood_group as BloodGroup | null,
    rhFactor: row.rh_factor as RhFactor | null,
    qualification: row.qualification,
    education: row.education,
    authorizations: row.authorizations,
    commuteRoute: row.commute_route,
    commuteMeans: orderedCommuteMeans(row.commute_means),
    commuteMeansOther: row.commute_means_other,
    commuteMinutes: row.commute_minutes,
  };
}
