import type { Reading } from './reading';

export function emptyReading(overrides: Partial<Reading> = {}): Reading {
  return {
    facts: [],
    workplaces: [],
    workplaceFacts: [],
    workplaceSuggestions: [],
    jobPositions: [],
    jobPositionFacts: [],
    responsiblePersons: [],
    fireEquipment: [],
    fireInstallations: [],
    substances: [],
    protectiveEquipment: [],
    employees: [],
    notes: [],
    ...overrides,
  };
}
