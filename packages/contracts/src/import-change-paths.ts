const importValuePathRoots = ['client', 'trainingSchedule', 'fireSafety'] as const;

const importItemPathRoots = [
  'fireEquipmentCounts',
  'assemblyPoints',
  'suggestedValues',
  'officeActivity',
] as const;

export const importChangePathPattern = new RegExp(
  `^((${importValuePathRoots.join('|')})\\.[A-Za-z]+|(${importItemPathRoots.join('|')})\\.[a-z0-9-]+)$`
);

export const substancesStatePath = 'fireSafety.substancesState';

export const smokingPlacePath = 'fireSafety.smokingPlace';

export const fireEquipmentCountPath = (id: string) => `fireEquipmentCounts.${id}`;

export const assemblyPointPath = (workplaceId: string) => `assemblyPoints.${workplaceId}`;

export const suggestedValuesPath = (workplaceId: string) => `suggestedValues.${workplaceId}`;

export const officeActivityPath = (workplaceId: string) => `officeActivity.${workplaceId}`;

// What the reading may draft from the client's activity where no document states it (ADR 041),
// and nothing else: never an area, a count, a date, a name, an address or a place.
export const suggestedWorkplaceFieldNames = [
  'combustibleMaterials',
  'ignitionSources',
  'fireRiskEquipment',
  'specificMeasures',
  'extinguisherNorm',
] as const;

export type SuggestedWorkplaceFieldName = (typeof suggestedWorkplaceFieldNames)[number];
