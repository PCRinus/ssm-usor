import {
  extinguisherCode,
  fireBuildingRequestSchema,
  fireEquipmentRequestSchema,
  fireInstallationRequestSchema,
  fireMaintenanceItemRequestSchema,
  fireSubstanceRequestSchema,
  updateClientFireSafetyRequestSchema,
  updateOrganizationAuthorizationsRequestSchema,
  workplaceRequestSchema,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildingFor,
  fireMeansFor,
  fireRolesToAdd,
  fireSafetyAuthorization,
  fireSafetyFor,
  fireSafetyTechnician,
  maintenanceItemsFor,
  mobileSiteFor,
  substancesFor,
} from './seed-fire-safety';

const userId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const workplaceId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('fireSafetyFor', () => {
  it('starts from the law and takes the calendar of the occupational safety schedule', () => {
    const row = fireSafetyFor(
      { id: clientId, training_first_month: 3, training_day_from: 4, training_day_to: 9 },
      userId
    );
    expect(row).toMatchObject({
      periodic_training_hours: 2,
      administrative_training_interval_months: 3,
      worker_training_interval_months: 3,
      training_first_month: 3,
      training_day_from: 4,
      training_day_to: 9,
    });
    expect(
      updateClientFireSafetyRequestSchema.safeParse({
        periodicTrainingHours: row.periodic_training_hours,
        wasteKinds: row.waste_kinds,
        wasteContractor: row.waste_contractor,
      }).success
    ).toBe(true);
  });

  it('has other firms on the premises of every other client, so decision 9 reads both ways', () => {
    const client = {
      id: clientId,
      training_first_month: null,
      training_day_from: null,
      training_day_to: null,
    };
    expect([0, 1].map((index) => fireSafetyFor(client, userId, index).has_third_parties)).toEqual([
      false,
      true,
    ]);
  });

  it('names who collects the waste at every other client, so decision 7 reads both ways', () => {
    const client = {
      id: clientId,
      training_first_month: null,
      training_day_from: null,
      training_day_to: null,
    };
    const named = fireSafetyFor(client, userId, 1);
    expect(fireSafetyFor(client, userId, 0).waste_collectors).toBeNull();
    expect(named.waste_collectors).toBe('personalul de curățenie și gestionarul depozitului');
    expect(
      updateClientFireSafetyRequestSchema.safeParse({ wasteCollectors: named.waste_collectors })
        .success
    ).toBe(true);
  });

  it('forbids smoking, allows it in a named place, and allows it with no place, in turn', () => {
    const client = {
      id: clientId,
      training_first_month: null,
      training_day_from: null,
      training_day_to: null,
    };
    const rules = [0, 1, 2, 3].map((index) => {
      const row = fireSafetyFor(client, userId, index);
      return [row.smoking_policy, row.smoking_place];
    });
    expect(rules).toEqual([
      ['forbidden_everywhere', null],
      ['designated_places', 'în curtea interioară, lângă poarta de acces auto'],
      ['designated_places', null],
      ['forbidden_everywhere', null],
    ]);
    const named = fireSafetyFor(client, userId, 1);
    expect(
      updateClientFireSafetyRequestSchema.safeParse({
        smokingPolicy: named.smoking_policy,
        smokingPlace: named.smoking_place,
      }).success
    ).toBe(true);
  });
});

describe('the seeded fire-safety provider', () => {
  it('has a technician with a certificate and an authorization the organization page accepts', () => {
    expect(
      updateOrganizationAuthorizationsRequestSchema.safeParse({
        fireSafetyTechnicianName: fireSafetyTechnician.fire_safety_technician_name,
        fireSafetyTechnicianCertificate: fireSafetyTechnician.fire_safety_technician_certificate,
        fireSafetyAuthorization,
      }).success
    ).toBe(true);
  });
});

describe('fireMeansFor', () => {
  it('gives a workplace the sample pack’s two P6 and one G3, and an alarm system', () => {
    const { equipment, installations } = fireMeansFor(
      { id: workplaceId, client_id: clientId },
      userId
    );
    expect(equipment.map((unit) => extinguisherCode(unit.agent!, unit.capacity!))).toEqual([
      'P6',
      'P6',
      'G3',
    ]);
    for (const unit of equipment) {
      expect(
        fireEquipmentRequestSchema.safeParse({ ...unit, workplaceId: unit.workplace_id }).success
      ).toBe(true);
    }
    expect(installations).toHaveLength(1);
    expect(
      fireInstallationRequestSchema.safeParse({ ...installations[0], workplaceId }).success
    ).toBe(true);
  });
});

describe('maintenanceItemsFor', () => {
  it('gives a workplace the gas installation, the chimney and the emergency lighting, in order, as the API accepts them', () => {
    const items = maintenanceItemsFor({ id: workplaceId, client_id: clientId }, userId);
    expect(items.map((item) => item.subject)).toEqual([
      'Instalația de utilizare a gazelor naturale',
      'Coșul de fum al centralei termice',
      'Testarea funcționării iluminatului de siguranță',
    ]);
    expect(items.map((item) => item.sort_order)).toEqual([0, 1, 2]);
    for (const item of items) {
      expect(
        fireMaintenanceItemRequestSchema.safeParse({
          workplaceId: item.workplace_id,
          subject: item.subject,
          intervalLabel: item.interval_label,
          checkedBy: item.checked_by,
        }).success
      ).toBe(true);
    }
  });
});

describe('buildingFor', () => {
  it('fills every fact of a complete building and half of the other, as the API accepts them', () => {
    const toRequest = (building: ReturnType<typeof buildingFor>) => ({
      yearBuilt: building.year_built,
      builtAreaM2: building.built_area_m2,
      levels: building.levels,
      classification: building.classification,
      structure: building.structure,
      heatingFuel: building.heating_fuel,
      gasUse: building.gas_use,
      electricalMaintainer: building.electrical_maintainer,
      electricalLastCheckOn: building.electrical_last_check_on,
      waterReserveM3: building.water_reserve_m3,
      notes: building.notes,
    });
    const complete = buildingFor({ id: workplaceId, client_id: clientId }, userId, true);
    const half = buildingFor({ id: workplaceId, client_id: clientId }, userId, false);
    expect(Object.values(toRequest(complete)).every((value) => value != null)).toBe(true);
    expect(half.structure).toBeUndefined();
    expect(half.year_built).toBe(1987);
    for (const building of [complete, half]) {
      expect(fireBuildingRequestSchema.safeParse(toRequest(building)).success).toBe(true);
      expect(building.workplace_id).toBe(workplaceId);
    }
  });
});

describe('mobileSiteFor', () => {
  it('is a mobile site with no area and no norm from annex 6, which the workplace dialog accepts', () => {
    const site = mobileSiteFor(clientId, userId);
    expect(site).toMatchObject({ kind: 'mobile_site', extinguisher_norm: 'none' });
    expect(site.floor_area_m2).toBeUndefined();
    expect(
      workplaceRequestSchema.safeParse({
        name: site.name,
        countyCode: site.county_code,
        locality: site.locality,
        addressLine: site.address_line,
        kind: site.kind,
        activity: site.activity,
        extinguisherNorm: site.extinguisher_norm,
        assemblyPoint: site.assembly_point,
        combustibleMaterials: site.combustible_materials,
        ignitionSources: site.ignition_sources,
        fireRiskEquipment: site.fire_risk_equipment,
      }).success
    ).toBe(true);
  });
});

describe('fireRolesToAdd', () => {
  it('adds only the fire-safety roles nobody holds', () => {
    expect(fireRolesToAdd([{ roles: ['workplace_manager', 'first_aid'] }])).toEqual([
      'fire_safety_coordinator',
      'fire_intervention_leader',
    ]);
    expect(
      fireRolesToAdd([
        { roles: ['workplace_manager'] },
        { roles: ['imminent_danger', 'fire_intervention_leader'] },
      ])
    ).toEqual(['fire_safety_coordinator']);
  });
});

describe('substancesFor', () => {
  it('lists a cleaning agent, a gas cylinder and a solvent the API would accept, in order', () => {
    const rows = substancesFor(clientId, userId);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.name)).toEqual([
      'Detergent dezinfectant pe bază de hipoclorit de sodiu',
      'Gaz petrolier lichefiat (propan) în butelii',
      'Diluant pentru vopsele (white spirit)',
    ]);
    for (const row of rows) {
      expect(
        fireSubstanceRequestSchema.safeParse({
          name: row.name,
          classification: row.classification,
          quantity: row.quantity,
          physicalChemicalProperties: row.physical_chemical_properties,
          identificationCodes: row.identification_codes,
          healthEnvironmentRisks: row.health_environment_risks,
          protectionMeans: row.protection_means,
          interventionMeasures: row.intervention_measures,
          extinguishingAgents: row.extinguishing_agents,
          storagePlace: row.storage_place,
          handling: row.handling,
        }).success
      ).toBe(true);
    }
  });

  it('leaves some texts of the data sheet out, so the list prints its gaps', () => {
    const [, propane] = substancesFor(clientId, userId);
    expect(propane!.health_environment_risks).toBeUndefined();
    expect(propane!.intervention_measures).toBeUndefined();
  });
});
