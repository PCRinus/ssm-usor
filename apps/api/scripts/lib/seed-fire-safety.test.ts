import {
  extinguisherCode,
  fireEquipmentRequestSchema,
  fireInstallationRequestSchema,
  updateClientFireSafetyRequestSchema,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { fireMeansFor, fireRolesToAdd, fireSafetyFor } from './seed-fire-safety';

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
