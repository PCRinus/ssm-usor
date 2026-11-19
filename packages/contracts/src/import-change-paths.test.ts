import { describe, expect, it } from 'vitest';

import {
  assemblyPointPath,
  fireEquipmentCountPath,
  importChangePathPattern,
  officeActivityPath,
  smokingPlacePath,
  substancesStatePath,
  suggestedValuesPath,
} from './import-change-paths';
import { importChangesSchema } from './imports';

describe('the paths of a client import’s changes', () => {
  it('takes every path the review and the confirm build', () => {
    const paths = [
      substancesStatePath,
      smokingPlacePath,
      'client.vatPayer',
      'trainingSchedule.ssmInterval',
      fireEquipmentCountPath('count-1'),
      assemblyPointPath('workplace-2'),
      suggestedValuesPath('workplace-2'),
      officeActivityPath('workplace-2'),
    ];
    for (const path of paths) expect(path).toMatch(importChangePathPattern);
    const fields = Object.fromEntries(paths.map((path) => [path, { option: 0 }]));
    expect(importChangesSchema.parse({ fields }).fields).toEqual(fields);
  });

  it('refuses a root it does not know and an item id with capitals', () => {
    expect('employees.lastName').not.toMatch(importChangePathPattern);
    expect('assemblyPoints.Workplace-2').not.toMatch(importChangePathPattern);
    expect('fireSafety.').not.toMatch(importChangePathPattern);
  });
});
