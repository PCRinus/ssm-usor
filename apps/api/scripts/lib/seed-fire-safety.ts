import { fireSafetyStartingValues, type ResponsiblePersonRole } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import { type SeedClient, seedOrganizationId } from './seed-organization';

type Tables = Database['public']['Tables'];
type FireSafetyInsert = Tables['client_fire_safety']['Insert'];
type SmokingRule = Pick<FireSafetyInsert, 'smoking_policy' | 'smoking_place'>;
type WorkplaceUpdate = Tables['client_workplaces']['Update'];
type EquipmentInsert = Tables['fire_equipment']['Insert'];
type InstallationInsert = Tables['fire_installations']['Insert'];

interface ClientCalendar {
  id: string;
  training_first_month: number | null;
  training_day_from: number | null;
  training_day_to: number | null;
}

// The three ways decision 4 reads, in turn, so a local review sees each of them (ADR 019).
const smokingRules: SmokingRule[] = [
  { smoking_policy: 'forbidden_everywhere', smoking_place: null },
  {
    smoking_policy: 'designated_places',
    smoking_place: 'în curtea interioară, lângă poarta de acces auto',
  },
  { smoking_policy: 'designated_places', smoking_place: null },
];

export function fireSafetyFor(
  client: ClientCalendar,
  createdBy: string,
  index = 0
): FireSafetyInsert {
  return {
    client_id: client.id,
    organization_id: seedOrganizationId,
    periodic_training_hours: fireSafetyStartingValues.periodicTrainingHours,
    administrative_training_interval_months:
      fireSafetyStartingValues.administrativeTrainingIntervalMonths,
    worker_training_interval_months: fireSafetyStartingValues.workerTrainingIntervalMonths,
    training_first_month: client.training_first_month ?? 2,
    training_day_from: client.training_day_from ?? 2,
    training_day_to: client.training_day_to ?? 7,
    ...smokingRules[index % smokingRules.length],
    waste_kinds: ['deșeuri de carton, hârtie și plastic', 'deșeuri menajere'],
    waste_contractor: 'Salubritate Demo S.R.L.',
    created_by: createdBy,
  };
}

export const workplaceFireFacts = {
  activity: 'Birouri',
  floor_area_m2: 120,
  extinguisher_norm: 'administrative_300',
  assembly_point: 'Parcarea din fața clădirii',
  combustible_materials: 'Hârtie, dosare, mobilier din lemn, ambalaje de carton',
  ignition_sources: 'Aparatură electrică, prize și prelungitoare, scurtcircuite',
  fire_risk_equipment: 'Calculatoare, imprimante, aparate de climatizare',
} satisfies WorkplaceUpdate;

// The sample pack's workplace: two P6 and one G3, and an alarm system.
export function fireMeansFor(
  workplace: { id: string; client_id: string },
  createdBy: string
): { equipment: EquipmentInsert[]; installations: InstallationInsert[] } {
  const base = {
    organization_id: seedOrganizationId,
    client_id: workplace.client_id,
    workplace_id: workplace.id,
    created_by: createdBy,
  };
  const serviced = {
    last_service_on: '2026-03-01',
    next_service_on: '2027-03-01',
    maintainer: 'Stingătoare Service Demo S.R.L.',
  };
  return {
    equipment: [
      {
        ...base,
        ...serviced,
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        location: 'Intrare',
      },
      { ...base, ...serviced, kind: 'extinguisher', agent: 'powder', capacity: 6, location: 'Hol' },
      {
        ...base,
        ...serviced,
        kind: 'extinguisher',
        agent: 'co2',
        capacity: 3,
        location: 'Tablou electric',
      },
    ],
    installations: [{ ...base, kind: 'detection_alarm', maintainer: 'Alarm Service Demo S.R.L.' }],
  };
}

export const fireSafetyTechnician = {
  fire_safety_technician_name: 'Radu Stan',
  fire_safety_technician_certificate: 'Certificat cadru tehnic PSI nr. 1234/2024',
} satisfies Tables['organizations']['Update'];

export const fireSafetyAuthorization = 'nr. 12 din 15.09.2026, ISU Timiș';

// Each only while missing, as below: a technician or an authorization typed on the
// organization page is kept.
export async function seedFireSafetyProvider(db: SeedClient) {
  const technician = await db
    .from('organizations')
    .update(fireSafetyTechnician)
    .eq('id', seedOrganizationId)
    .is('fire_safety_technician_name', null)
    .select('id');
  if (technician.error) {
    throw new Error(`Could not seed the fire-safety technician: ${technician.error.message}`);
  }
  const authorization = await db
    .from('organizations')
    .update({ fire_safety_authorization: fireSafetyAuthorization })
    .eq('id', seedOrganizationId)
    .is('fire_safety_authorization', null)
    .select('id');
  if (authorization.error) {
    throw new Error(`Could not seed the fire-safety authorization: ${authorization.error.message}`);
  }
  return { technician: technician.data.length > 0, authorization: authorization.data.length > 0 };
}

const fireRoles: ResponsiblePersonRole[] = ['fire_safety_coordinator', 'fire_intervention_leader'];

export function fireRolesToAdd(persons: { roles: ResponsiblePersonRole[] }[]) {
  const held = new Set(persons.flatMap((person) => person.roles));
  return fireRoles.filter((role) => !held.has(role));
}

// Each fact is seeded only while it is missing, so a rerun leaves alone what was entered by hand.
export async function seedFireSafety(db: SeedClient, clientIds: string[], createdBy: string) {
  const counts = { facts: 0, workplaces: 0, persons: 0, equipment: 0, installations: 0 };
  if (clientIds.length === 0) return counts;

  const clients = await db
    .from('clients')
    .select('id, training_first_month, training_day_from, training_day_to')
    .in('id', clientIds);
  if (clients.error) throw new Error(`Could not read clients: ${clients.error.message}`);
  const facts = await db
    .from('client_fire_safety')
    .upsert(
      [...clients.data]
        .sort((a, b) => clientIds.indexOf(a.id) - clientIds.indexOf(b.id))
        .map((client, index) => fireSafetyFor(client, createdBy, index)),
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
    .select('client_id');
  if (facts.error) throw new Error(`Could not seed fire-safety facts: ${facts.error.message}`);
  counts.facts = facts.data.length;

  const filled = await db
    .from('client_workplaces')
    .update(workplaceFireFacts)
    .in('client_id', clientIds)
    .is('archived_at', null)
    .is('activity', null)
    .select('id');
  if (filled.error) throw new Error(`Could not seed workplace facts: ${filled.error.message}`);
  counts.workplaces = filled.data.length;

  const persons = await db
    .from('client_responsible_persons')
    .select('id, client_id, roles')
    .in('client_id', clientIds)
    .is('archived_at', null)
    .order('created_at')
    .order('id');
  if (persons.error)
    throw new Error(`Could not read responsible persons: ${persons.error.message}`);
  for (const clientId of clientIds) {
    const ofClient = persons.data.filter((person) => person.client_id === clientId);
    const manager = ofClient.find((person) => person.roles.includes('workplace_manager'));
    const missing = fireRolesToAdd(ofClient);
    if (!manager || missing.length === 0) continue;
    const { error } = await db
      .from('client_responsible_persons')
      .update({ roles: [...manager.roles, ...missing] })
      .eq('id', manager.id);
    if (error) throw new Error(`Could not seed fire-safety roles: ${error.message}`);
    counts.persons += 1;
  }

  const workplaces = await db
    .from('client_workplaces')
    .select('id, client_id, fire_equipment(count), fire_installations(count)')
    .in('client_id', clientIds)
    .is('archived_at', null);
  if (workplaces.error) throw new Error(`Could not read workplaces: ${workplaces.error.message}`);
  const equipment: EquipmentInsert[] = [];
  const installations: InstallationInsert[] = [];
  for (const workplace of workplaces.data) {
    const means = fireMeansFor(workplace, createdBy);
    if (workplace.fire_equipment[0]?.count === 0) equipment.push(...means.equipment);
    if (workplace.fire_installations[0]?.count === 0) installations.push(...means.installations);
  }
  if (equipment.length > 0) {
    const { error } = await db.from('fire_equipment').insert(equipment);
    if (error) throw new Error(`Could not seed fire equipment: ${error.message}`);
  }
  if (installations.length > 0) {
    const { error } = await db.from('fire_installations').insert(installations);
    if (error) throw new Error(`Could not seed fire installations: ${error.message}`);
  }
  counts.equipment = equipment.length;
  counts.installations = installations.length;
  return counts;
}
