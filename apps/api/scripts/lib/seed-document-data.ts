import type { Database } from '../../src/database.types';
import { type SeedClient, seedOrganizationId } from './seed-organization';

type Tables = Database['public']['Tables'];
type WorkplaceInsert = Tables['client_workplaces']['Insert'];
type ResponsiblePersonInsert = Tables['client_responsible_persons']['Insert'];

export interface SeededClient {
  id: string;
  county_code: string | null;
  locality: string | null;
  address_line: string | null;
  legal_representative_name: string | null;
  legal_representative_role: string | null;
}

interface SeededEmployee {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
}

// Filled in only while the legal name is empty, so what an owner has typed on the organization
// page is kept.
export async function seedOrganizationLegalDetails(db: SeedClient, ownerName: string) {
  const { data, error } = await db
    .from('organizations')
    .update({
      legal_name: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
      cui: '1590082',
      trade_register_number: 'J35/1234/2015',
      county_code: 'TM',
      locality: 'Timișoara',
      address_line: 'Str. Exemplului nr. 1',
      legal_representative_name: ownerName,
      legal_representative_role: 'Administrator',
    })
    .eq('id', seedOrganizationId)
    .is('legal_name', null)
    .select('id');
  if (error) throw new Error(`Could not seed the legal details: ${error.message}`);
  return data.length > 0;
}

// The same rule for the owner's professional title.
export async function seedProfessionalTitle(db: SeedClient, ownerUserId: string) {
  const { error } = await db
    .from('profiles')
    .update({ professional_title: 'Evaluator de risc SSM' })
    .eq('user_id', ownerUserId)
    .is('professional_title', null);
  if (error) throw new Error(`Could not seed the professional title: ${error.message}`);
}

export function workplaceFor(client: SeededClient, createdBy: string): WorkplaceInsert | null {
  if (!client.locality) return null;
  return {
    organization_id: seedOrganizationId,
    client_id: client.id,
    name: 'Sediu social',
    is_registered_office: true,
    county_code: client.county_code,
    locality: client.locality,
    address_line: client.address_line,
    created_by: createdBy,
  };
}

// The usual small company: one employee runs the workplace and gives first aid, and the
// legal representative, who is not an employee, takes the other two roles.
export function responsiblePersonsFor(
  client: SeededClient,
  employee: SeededEmployee | null,
  createdBy: string
): ResponsiblePersonInsert[] {
  const base = { organization_id: seedOrganizationId, client_id: client.id, created_by: createdBy };
  const rows: ResponsiblePersonInsert[] = [];
  if (employee) {
    rows.push({
      ...base,
      employee_id: employee.id,
      full_name: `${employee.first_name} ${employee.last_name}`,
      job_title: employee.job_title,
      roles: ['workplace_manager', 'first_aid'],
    });
  }
  if (client.legal_representative_name) {
    rows.push({
      ...base,
      full_name: client.legal_representative_name,
      job_title: client.legal_representative_role ?? 'Administrator',
      roles: ['risk_evaluation_team', 'imminent_danger'],
    });
  }
  return rows;
}

// Neither table has a natural key to upsert on, so a client is seeded only while it has no
// rows of the kind. A rerun then leaves alone whatever was added or changed by hand.
export async function seedDocumentData(db: SeedClient, clients: SeededClient[], createdBy: string) {
  let workplaces = 0;
  let persons = 0;
  for (const client of clients) {
    const existingWorkplaces = await db
      .from('client_workplaces')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id);
    if (existingWorkplaces.error) {
      throw new Error(`Could not read workplaces: ${existingWorkplaces.error.message}`);
    }
    const workplace = workplaceFor(client, createdBy);
    if (existingWorkplaces.count === 0 && workplace) {
      const { error } = await db.from('client_workplaces').insert(workplace);
      if (error) throw new Error(`Could not seed a workplace: ${error.message}`);
      workplaces += 1;
    }

    const existingPersons = await db
      .from('client_responsible_persons')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id);
    if (existingPersons.error) {
      throw new Error(`Could not read responsible persons: ${existingPersons.error.message}`);
    }
    if (existingPersons.count !== 0) continue;
    const employee = await db
      .from('employees')
      .select('id, first_name, last_name, job_title')
      .eq('client_id', client.id)
      .eq('status', 'active')
      .is('archived_at', null)
      .order('hired_at')
      .order('id')
      .limit(1)
      .maybeSingle();
    if (employee.error) throw new Error(`Could not read employees: ${employee.error.message}`);
    const rows = responsiblePersonsFor(client, employee.data, createdBy);
    if (rows.length === 0) continue;
    const { error } = await db.from('client_responsible_persons').insert(rows);
    if (error) throw new Error(`Could not seed responsible persons: ${error.message}`);
    persons += rows.length;
  }
  return { workplaces, persons };
}
