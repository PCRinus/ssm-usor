import { fakerRO } from '@faker-js/faker';
import { countyCodes, cuiControlDigit } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import type { SeedClient } from './seed-organization';

export type ClientInsert = Database['public']['Tables']['clients']['Insert'];

// Common CAEN Rev. 3 activities among small and medium employers.
const caenCodes = [
  '1071',
  '2511',
  '2910',
  '3100',
  '4100',
  '4211',
  '4321',
  '4342',
  '4631',
  '4711',
  '4755',
  '4941',
  '5510',
  '5611',
  '6210',
  '6820',
  '7112',
  '7311',
  '8121',
  '8130',
  '8621',
  '8623',
  '8699',
  '9621',
];

const legalForms = ['SRL', 'SRL', 'SRL', 'SRL', 'SA', 'PFA', 'II'];

function fakeCui() {
  const body = String(fakerRO.number.int({ min: 100_000, max: 49_999_999 }));
  return `${body}${cuiControlDigit(body)}`;
}

// Derived from the CUI, not drawn from faker: another draw would shift every later client of
// the sequence, and a rerun would insert new clients next to the ones it should update.
function documentDetails(cui: string, complete: boolean) {
  if (!complete) return {};
  const n = Number(cui);
  const firstDay = 1 + (n % 10);
  return {
    legal_representative_role: n % 5 === 0 ? 'Director general' : 'Administrator',
    periodic_training_minutes: [30, 60, 90, 120][n % 4]!,
    administrative_training_interval_months: n % 3 === 0 ? 3 : 6,
    worker_training_interval_months: 3,
    training_first_month: 1 + (n % 3),
    training_day_from: firstDay,
    training_day_to: firstDay + 5,
  } satisfies Partial<ClientInsert>;
}

// Deterministic for a given seed value, so reruns upsert the same rows.
export function fakeClients(
  count: number,
  seedValue: number,
  organizationId: string,
  createdBy: string
): ClientInsert[] {
  fakerRO.seed(seedValue);
  const seen = new Set<string>();
  const rows: ClientInsert[] = [];
  while (rows.length < count) {
    const cui = fakeCui();
    if (seen.has(cui)) continue;
    seen.add(cui);
    const county = fakerRO.helpers.arrayElement(countyCodes);
    const complete = fakerRO.datatype.boolean({ probability: 0.8 });
    rows.push({
      organization_id: organizationId,
      legal_name: `${fakerRO.company.name()} ${fakerRO.helpers.arrayElement(legalForms)}`,
      cui,
      vat_payer: fakerRO.datatype.boolean({ probability: 0.7 }),
      caen_code: complete ? fakerRO.helpers.arrayElement(caenCodes) : null,
      trade_register_number: complete
        ? `J${fakerRO.number.int({ min: 1, max: 52 })}/${fakerRO.number.int({ min: 100, max: 4999 })}/${fakerRO.number.int({ min: 1995, max: 2025 })}`
        : null,
      county_code: complete ? county : null,
      locality: complete ? fakerRO.location.city() : null,
      address_line: complete ? fakerRO.location.streetAddress() : null,
      legal_representative_name: complete ? fakerRO.person.fullName() : null,
      declared_employee_count: fakerRO.helpers.weightedArrayElement([
        { weight: 5, value: fakerRO.number.int({ min: 1, max: 9 }) },
        { weight: 3, value: fakerRO.number.int({ min: 10, max: 49 }) },
        { weight: 2, value: fakerRO.number.int({ min: 50, max: 400 }) },
      ]),
      created_by: createdBy,
      ...documentDetails(cui, complete),
    });
  }
  return rows;
}

export async function seedClients(db: SeedClient, rows: ClientInsert[]) {
  const { data, error } = await db
    .from('clients')
    .upsert(rows, { onConflict: 'organization_id,cui' })
    .select(
      'id, declared_employee_count, county_code, locality, address_line, legal_representative_name, legal_representative_role'
    );
  if (error) throw new Error(`Could not seed clients: ${error.message}`);
  return data;
}
