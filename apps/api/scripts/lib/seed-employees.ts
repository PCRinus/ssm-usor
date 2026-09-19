import { fakerRO } from '@faker-js/faker';
import { bloodGroups, cnpControlDigit, rhFactors } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import type { SeedClient } from './seed-organization';

// The database assigns the job position named like the title, creating it when the client
// lacks it (ADR 006), so a seeded employee never names one.
export type EmployeeInsert = Omit<
  Database['public']['Tables']['employees']['Insert'],
  'job_position_id'
>;

export interface SeedClientRef {
  id: string;
  declared_employee_count: number | null;
}

const jobTitles = [
  'Sudor',
  'Electrician',
  'Lăcătuș mecanic',
  'Șofer',
  'Operator producție',
  'Manipulant mărfuri',
  'Gestionar',
  'Vânzător',
  'Ospătar',
  'Bucătar',
  'Contabil',
  'Economist',
  'Inginer',
  'Programator',
  'Asistent manager',
  'Agent curățenie',
  'Muncitor necalificat',
  'Zidar',
  'Instalator',
  'Recepționer',
];

const officeJobTitles = [
  'Contabil',
  'Economist',
  'Inginer',
  'Programator',
  'Asistent manager',
  'Recepționer',
];

function pad(value: number, length: number) {
  return String(value).padStart(length, '0');
}

function fakeCnp(birthDate: Date, female: boolean) {
  const year = birthDate.getUTCFullYear();
  const century = year >= 2000 ? (female ? 6 : 5) : female ? 2 : 1;
  const body = `${century}${pad(year % 100, 2)}${pad(birthDate.getUTCMonth() + 1, 2)}${pad(
    birthDate.getUTCDate(),
    2
  )}${pad(fakerRO.number.int({ min: 1, max: 52 }), 2)}${pad(fakerRO.number.int({ min: 1, max: 999 }), 3)}`;
  return `${body}${cnpControlDigit(body)}`;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Deterministic for a given seed value, so reruns upsert the same rows (keyed on id).
// Each client gets a slice of its declared headcount, capped so the largest fake clients
// still span a few pages of 25.
export function fakeEmployees(
  clients: SeedClientRef[],
  seedValue: number,
  organizationId: string,
  createdBy: string
): EmployeeInsert[] {
  fakerRO.seed(seedValue);
  const rows: EmployeeInsert[] = [];
  for (const client of clients) {
    const count = Math.min(client.declared_employee_count ?? 3, 60);
    const seenCnp = new Set<string>();
    for (let index = 1; index <= count; index += 1) {
      const female = fakerRO.datatype.boolean();
      const sex = female ? 'female' : 'male';
      const birthDate = fakerRO.date.birthdate({ mode: 'age', min: 19, max: 62 });
      const hiredAt = fakerRO.date.between({
        from: new Date(Date.UTC(birthDate.getUTCFullYear() + 18, 0, 1)),
        to: new Date('2026-09-01T00:00:00Z'),
      });
      const withCnp = fakerRO.datatype.boolean({ probability: 0.7 });
      let cnp: string | null = null;
      if (withCnp) {
        do cnp = fakeCnp(birthDate, female);
        while (seenCnp.has(cnp));
        seenCnp.add(cnp);
      }
      const withContact = fakerRO.datatype.boolean({ probability: 0.8 });
      const withSheet = fakerRO.datatype.boolean({ probability: 0.5 });
      const status = fakerRO.helpers.weightedArrayElement([
        { weight: 9, value: 'active' as const },
        { weight: 1, value: 'terminated' as const },
      ]);
      const lastName = fakerRO.person.lastName();
      const firstName = fakerRO.person.firstName(sex);
      rows.push({
        id: fakerRO.string.uuid(),
        organization_id: organizationId,
        client_id: client.id,
        last_name: lastName,
        first_name: firstName,
        cnp,
        employee_number: fakerRO.datatype.boolean({ probability: 0.6 }) ? String(index) : null,
        email: withContact
          ? fakerRO.internet.email({ firstName, lastName, provider: 'example.com' }).toLowerCase()
          : null,
        phone: withContact ? `07${fakerRO.string.numeric(8)}` : null,
        job_title: fakerRO.helpers.arrayElement(jobTitles),
        hired_at: isoDate(hiredAt),
        status,
        terminated_at:
          status === 'terminated'
            ? isoDate(fakerRO.date.between({ from: hiredAt, to: new Date('2026-09-15T00:00:00Z') }))
            : null,
        birth_date: withCnp || withSheet ? isoDate(birthDate) : null,
        birth_place: withSheet ? fakerRO.location.city() : null,
        home_address: withSheet
          ? `${fakerRO.location.streetAddress()}, ${fakerRO.location.city()}`
          : null,
        blood_group: withSheet ? fakerRO.helpers.arrayElement(bloodGroups) : null,
        rh_factor: withSheet ? fakerRO.helpers.arrayElement(rhFactors) : null,
        notes: null,
        created_by: createdBy,
      });
    }
  }
  return rows;
}

export async function seedEmployees(db: SeedClient, rows: EmployeeInsert[]) {
  if (rows.length === 0) return 0;
  const { data, error } = await db
    .from('employees')
    .upsert(rows as Database['public']['Tables']['employees']['Insert'][], { onConflict: 'id' })
    .select('id');
  if (error) throw new Error(`Could not seed employees: ${error.message}`);
  // Positions are created in the category with the shorter interval; the office ones among
  // the seeded titles belong in the other.
  const organizationIds = [...new Set(rows.map((row) => row.organization_id))];
  const categorized = await db
    .from('job_positions')
    .update({ staff_category: 'technical_administrative', work_zone: 'Birou' })
    .in('organization_id', organizationIds)
    .in('name', officeJobTitles);
  if (categorized.error) {
    throw new Error(`Could not categorize seeded job positions: ${categorized.error.message}`);
  }
  return data.length;
}
