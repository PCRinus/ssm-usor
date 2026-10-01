import { describe, expect, it } from 'vitest';

import { officeEvaluation } from '../../src/modules/documents/risk-evaluations.fixture';
import { profileRows, seededProfiles } from './seed-evaluation-profiles';

describe('profileRows', () => {
  it("links the profile's factors and measures, in the fixture's order", () => {
    let next = 0;
    const rows = profileRows(
      { organizationId: 'org', createdBy: 'user' },
      'Lucrător de birou',
      officeEvaluation,
      () => `id-${(next += 1)}`
    );
    expect(rows.profile).toEqual({
      id: 'id-1',
      organization_id: 'org',
      created_by: 'user',
      name: 'Lucrător de birou',
    });
    expect(rows.factors.map((factor) => factor.sort_order)).toEqual(
      officeEvaluation.factors.map((_, index) => index)
    );
    expect(rows.factors.every((factor) => factor.profile_id === 'id-1')).toBe(true);
    expect(rows.measures).toHaveLength(
      officeEvaluation.factors.reduce((sum, factor) => sum + factor.measures.length, 0)
    );
    const factorIds = new Set(rows.factors.map((factor) => factor.id));
    expect(rows.measures.every((measure) => factorIds.has(measure.factor_id))).toBe(true);
  });

  it('seeds two named profiles from the sample evaluations', () => {
    expect(seededProfiles.map(([name]) => name)).toEqual([
      'Lucrător de birou',
      'Lucrător în atelier',
    ]);
  });
});
