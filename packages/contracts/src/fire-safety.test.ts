import { describe, expect, it } from 'vitest';

import { responsiblePersonRequestSchema, workplaceRequestSchema } from './document-data';
import {
  extinguisherCode,
  fireEquipmentRequestSchema,
  fireExtinguisherNorms,
  fireInstallationRequestSchema,
  minimumExtinguishers,
  updateClientFireSafetyRequestSchema,
} from './fire-safety';

const workplaceId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('extinguisherCode', () => {
  it('prints the agent letters before the capacity, as the trade writes it', () => {
    expect(extinguisherCode('powder', 6)).toBe('P6');
    expect(extinguisherCode('co2', 3)).toBe('G3');
    expect(extinguisherCode('foam', 6)).toBe('SM6');
    expect(extinguisherCode('water', 9)).toBe('AP9');
    expect(extinguisherCode('clean_agent', 2)).toBe('GI2');
    expect(extinguisherCode('powder', 50)).toBe('P50');
  });
});

describe('minimumExtinguishers', () => {
  it('divides the area by the norm and rounds up', () => {
    expect(minimumExtinguishers(85, 'commercial_200')).toBe(1);
    expect(minimumExtinguishers(450, 'commercial_200')).toBe(3);
    expect(minimumExtinguishers(600, 'administrative_300')).toBe(2);
    expect(minimumExtinguishers(601, 'mixed_300')).toBe(3);
    expect(minimumExtinguishers(151, 'other_150')).toBe(2);
  });

  it('asks for one at least, and has no area figure for dwellings', () => {
    for (const norm of fireExtinguisherNorms.filter((norm) => norm !== 'residential_level')) {
      expect(minimumExtinguishers(1, norm)).toBe(1);
    }
    expect(minimumExtinguishers(400, 'residential_level')).toBeNull();
  });
});

describe('fireEquipmentRequestSchema', () => {
  const extinguisher = { workplaceId, kind: 'extinguisher', agent: 'powder', capacity: 6 };

  it('takes an extinguisher with its agent and capacity, wheeled or not', () => {
    expect(fireEquipmentRequestSchema.parse(extinguisher)).toMatchObject({ wheeled: false });
    expect(fireEquipmentRequestSchema.safeParse({ ...extinguisher, wheeled: true }).success).toBe(
      true
    );
  });

  it('refuses an extinguisher without an agent or a capacity', () => {
    for (const body of [
      { ...extinguisher, agent: null },
      { ...extinguisher, capacity: undefined },
    ]) {
      expect(fireEquipmentRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('refuses an agent, a capacity or wheels on anything but an extinguisher', () => {
    for (const body of [
      { workplaceId, kind: 'sand_box', agent: 'powder' },
      { workplaceId, kind: 'fire_post', capacity: 6 },
      { workplaceId, kind: 'fire_blanket', wheeled: true },
    ]) {
      expect(fireEquipmentRequestSchema.safeParse(body).success).toBe(false);
    }
    expect(fireEquipmentRequestSchema.safeParse({ workplaceId, kind: 'sand_box' }).success).toBe(
      true
    );
  });

  it('keeps a capacity within what a portable or wheeled unit holds', () => {
    expect(fireEquipmentRequestSchema.safeParse({ ...extinguisher, capacity: 0 }).success).toBe(
      false
    );
    expect(fireEquipmentRequestSchema.safeParse({ ...extinguisher, capacity: 251 }).success).toBe(
      false
    );
  });
});

describe('fireInstallationRequestSchema', () => {
  it('asks a description only of another kind', () => {
    expect(
      fireInstallationRequestSchema.safeParse({ workplaceId, kind: 'interior_hydrants' }).success
    ).toBe(true);
    expect(fireInstallationRequestSchema.safeParse({ workplaceId, kind: 'other' }).success).toBe(
      false
    );
    expect(
      fireInstallationRequestSchema.safeParse({
        workplaceId,
        kind: 'other',
        description: 'Ușă rezistentă la foc',
      }).success
    ).toBe(true);
  });
});

describe('updateClientFireSafetyRequestSchema', () => {
  it('saves a card filled in halfway', () => {
    expect(updateClientFireSafetyRequestSchema.parse({ periodicTrainingHours: 2 })).toEqual({
      periodicTrainingHours: 2,
      wasteKinds: [],
    });
  });

  it('keeps the bounds of OMAI 712/2005', () => {
    for (const body of [
      { periodicTrainingHours: 1 },
      { administrativeTrainingIntervalMonths: 12 },
      { workerTrainingIntervalMonths: 7 },
      { trainingDayFrom: 8, trainingDayTo: 7 },
    ]) {
      expect(updateClientFireSafetyRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('takes at most twelve kinds of waste, each once', () => {
    const kinds = Array.from({ length: 13 }, (_, index) => `deșeu ${index}`);
    expect(updateClientFireSafetyRequestSchema.safeParse({ wasteKinds: kinds }).success).toBe(
      false
    );
    expect(
      updateClientFireSafetyRequestSchema.safeParse({ wasteKinds: ['Carton', 'carton'] }).success
    ).toBe(false);
  });

  it('takes a smoking place of up to 240 characters, trimmed', () => {
    expect(
      updateClientFireSafetyRequestSchema.parse({
        smokingPolicy: 'designated_places',
        smokingPlace: '  în curtea interioară, lângă poarta de acces auto ',
      }).smokingPlace
    ).toBe('în curtea interioară, lângă poarta de acces auto');
    expect(
      updateClientFireSafetyRequestSchema.safeParse({ smokingPlace: 'x'.repeat(241) }).success
    ).toBe(false);
  });
});

describe('the fire-safety fields elsewhere', () => {
  it('lets one person hold all seven roles, and no role twice', () => {
    const person = {
      fullName: 'Ion Popescu',
      jobTitle: 'Manager magazin',
      employeeId: workplaceId,
    };
    const all = [
      'workplace_manager',
      'first_aid',
      'risk_evaluation_team',
      'imminent_danger',
      'workers_representative',
      'fire_safety_coordinator',
      'fire_intervention_leader',
    ];
    expect(responsiblePersonRequestSchema.safeParse({ ...person, roles: all }).success).toBe(true);
    expect(
      responsiblePersonRequestSchema.safeParse({ ...person, roles: [...all, 'first_aid'] }).success
    ).toBe(false);
  });

  it('gives a workplace its fire-safety facts, all optional', () => {
    expect(workplaceRequestSchema.safeParse({ name: 'Gelaterie' }).success).toBe(true);
    expect(workplaceRequestSchema.safeParse({ name: 'Gelaterie', floorAreaM2: 0 }).success).toBe(
      false
    );
    expect(
      workplaceRequestSchema.safeParse({ name: 'Gelaterie', extinguisherNorm: 'commercial_250' })
        .success
    ).toBe(false);
  });
});
