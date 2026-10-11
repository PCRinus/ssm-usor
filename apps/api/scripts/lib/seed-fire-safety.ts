import { fireSafetyStartingValues, type ResponsiblePersonRole } from '@ssm-usor/contracts';

import type { Database } from '../../src/database.types';
import { type SeedClient, seedOrganizationId } from './seed-organization';

type Tables = Database['public']['Tables'];
type FireSafetyInsert = Tables['client_fire_safety']['Insert'];
type SmokingRule = Pick<FireSafetyInsert, 'smoking_policy' | 'smoking_place'>;
type WorkplaceUpdate = Tables['client_workplaces']['Update'];
type WorkplaceInsert = Tables['client_workplaces']['Insert'];
type EquipmentInsert = Tables['fire_equipment']['Insert'];
type InstallationInsert = Tables['fire_installations']['Insert'];
type SubstanceInsert = Tables['fire_substances']['Insert'];
type MaintenanceItemInsert = Tables['fire_maintenance_items']['Insert'];

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
    waste_collectors: index % 2 === 1 ? 'personalul de curățenie și gestionarul depozitului' : null,
    has_third_parties: index % 2 === 1,
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

export const mobileSiteName = 'Șantier Dumbrăvița';

// The construction firm's case of ADR 018's amendment, so the previews print a workplace with no
// area and no norm.
export function mobileSiteFor(clientId: string, createdBy: string): WorkplaceInsert {
  return {
    organization_id: seedOrganizationId,
    client_id: clientId,
    name: mobileSiteName,
    county_code: 'TM',
    locality: 'Dumbrăvița',
    address_line: 'Str. Petőfi Sándor 50',
    kind: 'mobile_site',
    activity: 'Lucrări de construcții și instalații',
    extinguisher_norm: 'none',
    assembly_point: 'Zona de acces în șantier, lângă containerul de birou',
    combustible_materials: 'Cofraje și schele din lemn, ambalaje, carburanți pentru utilaje',
    ignition_sources: 'Lucrări de sudură și tăiere, instalația electrică provizorie',
    fire_risk_equipment: 'Grup electrogen, aparat de sudură, polizor unghiular',
    created_by: createdBy,
  };
}

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

// What the inventory does not hold, so the schedules 5.4 print free rows below the derived ones.
export function maintenanceItemsFor(
  workplace: { id: string; client_id: string },
  createdBy: string
): MaintenanceItemInsert[] {
  const base = {
    organization_id: seedOrganizationId,
    client_id: workplace.client_id,
    workplace_id: workplace.id,
    created_by: createdBy,
  };
  return [
    {
      ...base,
      subject: 'Instalația de utilizare a gazelor naturale',
      interval_label: 'anual',
      checked_by: 'Operatorul de distribuție a gazelor naturale',
      sort_order: 0,
    },
    {
      ...base,
      subject: 'Coșul de fum al centralei termice',
      interval_label: 'anual, înainte de sezonul rece',
      checked_by: 'Firmă autorizată de coșerit',
      sort_order: 1,
    },
    {
      ...base,
      subject: 'Testarea funcționării iluminatului de siguranță',
      interval_label: 'la 6 luni',
      checked_by: 'Electricianul autorizat al unității',
      sort_order: 2,
    },
  ];
}

// A cleaning agent, a gas cylinder and a solvent, each with some texts of its data sheet left
// out, so the list 5.3 prints its gaps (ADR 018).
export function substancesFor(clientId: string, createdBy: string): SubstanceInsert[] {
  const base = { organization_id: seedOrganizationId, client_id: clientId, created_by: createdBy };
  return [
    {
      ...base,
      sort_order: 0,
      name: 'Detergent dezinfectant pe bază de hipoclorit de sodiu',
      classification: 'Skin Corr. 1B, H314; Aquatic Acute 1, H400; EUH031',
      quantity: '4 flacoane de 1 l',
      identification_codes: 'Hipoclorit de sodiu, CAS 7681-52-9',
      health_environment_risks:
        'Provoacă arsuri grave ale pielii și lezarea ochilor; foarte toxic pentru mediul acvatic; în contact cu acizii degajă un gaz toxic',
      protection_means: 'Mănuși de protecție, ochelari de protecție',
      intervention_measures:
        'Ochii și pielea se clătesc cu multă apă câteva minute; la înghițire se clătește gura, fără a provoca voma, și se cheamă medicul',
      extinguishing_agents:
        'Produsul nu este inflamabil; se folosesc mijloacele potrivite incendiului din jur',
      storage_place: 'Magazia materialelor de curățenie, separat de produsele acide',
      handling: 'Nu se amestecă cu alte produse de curățenie, mai ales cu cele acide',
    },
    {
      ...base,
      sort_order: 1,
      name: 'Gaz petrolier lichefiat (propan) în butelii',
      classification: 'Flam. Gas 1, H220; Press. Gas (Liquefied gas), H280',
      quantity: '2 butelii de 11 kg',
      physical_chemical_properties: 'Gaz incolor, mai greu decât aerul, extrem de inflamabil',
      identification_codes: 'Propan, CAS 74-98-6, nr. ONU 1965',
      extinguishing_agents: 'Pulbere, CO₂; buteliile se răcesc cu apă pulverizată',
      storage_place: 'Cușca metalică ventilată din curte, departe de surse de căldură',
      handling:
        'Butelia se transportă și se folosește în poziție verticală, cu robinetul închis când nu este folosită',
    },
    {
      ...base,
      sort_order: 2,
      name: 'Diluant pentru vopsele (white spirit)',
      classification: 'Flam. Liq. 3, H226; Asp. Tox. 1, H304; STOT RE 1, H372',
      quantity: '2 bidoane de 5 l',
      physical_chemical_properties:
        'Lichid incolor, cu miros caracteristic, punct de inflamabilitate 38 °C',
      health_environment_risks:
        'Poate fi mortal în caz de înghițire și de pătrundere în căile respiratorii; afectează sistemul nervos central la expunere prelungită',
      protection_means: 'Mănuși din nitril, ochelari de protecție, ventilarea încăperii',
      extinguishing_agents: 'Spumă, pulbere, CO₂; nu se folosește jet de apă',
      storage_place: 'Dulapul metalic pentru substanțe inflamabile din atelier',
    },
  ];
}

export const fireSafetyTechnician = {
  fire_safety_technician_name: 'Radu Stan',
  fire_safety_technician_certificate: 'CT 1234/2024',
} satisfies Tables['organizations']['Update'];

export const fireSafetyAuthorization = 'nr. 12 din 15.09.2026, ISU Timiș';

// Each only while missing, as below: a technician, a certificate or an authorization typed on the
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
  const certificate = await db
    .from('organizations')
    .update({
      fire_safety_technician_certificate: fireSafetyTechnician.fire_safety_technician_certificate,
    })
    .eq('id', seedOrganizationId)
    .is('fire_safety_technician_certificate', null)
    .select('id');
  if (certificate.error) {
    throw new Error(`Could not seed the technician's certificate: ${certificate.error.message}`);
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
  return {
    technician: technician.data.length > 0,
    certificate: certificate.data.length > 0,
    authorization: authorization.data.length > 0,
  };
}

const fireRoles: ResponsiblePersonRole[] = ['fire_safety_coordinator', 'fire_intervention_leader'];

export function fireRolesToAdd(persons: { roles: ResponsiblePersonRole[] }[]) {
  const held = new Set(persons.flatMap((person) => person.roles));
  return fireRoles.filter((role) => !held.has(role));
}

// Each fact is seeded only while it is missing, so a rerun leaves alone what was entered by hand.
export async function seedFireSafety(db: SeedClient, clientIds: string[], createdBy: string) {
  const counts = {
    facts: 0,
    smoking: 0,
    workplaces: 0,
    sites: 0,
    persons: 0,
    equipment: 0,
    installations: 0,
    maintenanceItems: 0,
    substancesDeclared: 0,
    substances: 0,
  };
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

  // A card saved before the smoking rule was asked for (ADR 019) would hold the set back.
  const smoking = await db
    .from('client_fire_safety')
    .update({ smoking_policy: 'forbidden_everywhere' })
    .in('client_id', clientIds)
    .is('smoking_policy', null)
    .select('client_id');
  if (smoking.error) throw new Error(`Could not seed the smoking rule: ${smoking.error.message}`);
  counts.smoking = smoking.data.length;

  const filled = await db
    .from('client_workplaces')
    .update(workplaceFireFacts)
    .in('client_id', clientIds)
    .is('archived_at', null)
    .is('activity', null)
    .select('id');
  if (filled.error) throw new Error(`Could not seed workplace facts: ${filled.error.message}`);
  counts.workplaces = filled.data.length;

  // Every third client from the second, so most clients keep the one workplace they have.
  const siteClientIds = clientIds.filter((_, index) => index % 3 === 1);
  if (siteClientIds.length > 0) {
    const existing = await db
      .from('client_workplaces')
      .select('client_id')
      .in('client_id', siteClientIds)
      .eq('name', mobileSiteName);
    if (existing.error) throw new Error(`Could not read workplaces: ${existing.error.message}`);
    const sites = siteClientIds
      .filter((clientId) => !existing.data.some((row) => row.client_id === clientId))
      .map((clientId) => mobileSiteFor(clientId, createdBy));
    if (sites.length > 0) {
      const { error } = await db.from('client_workplaces').insert(sites);
      if (error) throw new Error(`Could not seed a mobile site: ${error.message}`);
    }
    counts.sites = sites.length;
  }

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
    .select(
      'id, client_id, kind, fire_equipment(count), fire_installations(count), fire_maintenance_items(count)'
    )
    .in('client_id', clientIds)
    .is('archived_at', null);
  if (workplaces.error) throw new Error(`Could not read workplaces: ${workplaces.error.message}`);
  const equipment: EquipmentInsert[] = [];
  const installations: InstallationInsert[] = [];
  const maintenanceItems: MaintenanceItemInsert[] = [];
  for (const workplace of workplaces.data) {
    const means = fireMeansFor(workplace, createdBy);
    if (workplace.fire_equipment[0]?.count === 0) equipment.push(...means.equipment);
    if (workplace.kind === 'fixed_space' && workplace.fire_installations[0]?.count === 0) {
      installations.push(...means.installations);
    }
    if (workplace.kind === 'fixed_space' && workplace.fire_maintenance_items[0]?.count === 0) {
      maintenanceItems.push(...maintenanceItemsFor(workplace, createdBy));
    }
  }
  if (equipment.length > 0) {
    const { error } = await db.from('fire_equipment').insert(equipment);
    if (error) throw new Error(`Could not seed fire equipment: ${error.message}`);
  }
  if (installations.length > 0) {
    const { error } = await db.from('fire_installations').insert(installations);
    if (error) throw new Error(`Could not seed fire installations: ${error.message}`);
  }
  if (maintenanceItems.length > 0) {
    const { error } = await db.from('fire_maintenance_items').insert(maintenanceItems);
    if (error) throw new Error(`Could not seed the free rows of the schedules: ${error.message}`);
  }
  counts.equipment = equipment.length;
  counts.installations = installations.length;
  counts.maintenanceItems = maintenanceItems.length;

  // Every other client declares none and the rest list theirs, so both forms of 5.3 are seen.
  for (const [state, ids] of [
    ['none', clientIds.filter((_, index) => index % 2 === 0)],
    ['listed', clientIds.filter((_, index) => index % 2 === 1)],
  ] as const) {
    if (ids.length === 0) continue;
    const decided = await db
      .from('client_fire_safety')
      .update({ substances_state: state })
      .in('client_id', ids)
      .eq('substances_state', 'undecided')
      .select('client_id');
    if (decided.error) {
      throw new Error(`Could not seed the substances state: ${decided.error.message}`);
    }
    counts.substancesDeclared += decided.data.length;
  }
  const [listing, listed] = await Promise.all([
    db
      .from('client_fire_safety')
      .select('client_id')
      .in('client_id', clientIds)
      .eq('substances_state', 'listed'),
    db.from('fire_substances').select('client_id').in('client_id', clientIds),
  ]);
  if (listing.error) throw new Error(`Could not read substances: ${listing.error.message}`);
  if (listed.error) throw new Error(`Could not read substances: ${listed.error.message}`);
  const substances = listing.data
    .filter((row) => !listed.data.some((entry) => entry.client_id === row.client_id))
    .flatMap((row) => substancesFor(row.client_id, createdBy));
  if (substances.length > 0) {
    const { error } = await db.from('fire_substances').insert(substances);
    if (error) throw new Error(`Could not seed dangerous substances: ${error.message}`);
  }
  counts.substances = substances.length;
  return counts;
}
