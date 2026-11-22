import { describe, expect, it } from 'vitest';

import { riskZoneRequestSchema, updateRiskZonesStateRequestSchema } from './risk-zones';

const factorId = '00000000-0000-4000-8000-000000000001';

describe('riskZoneRequestSchema', () => {
  it('takes a zone of linked factors, trimming its name', () => {
    expect(
      riskZoneRequestSchema.parse({ name: '  Tablou electric ', factorIds: [factorId] })
    ).toEqual({ name: 'Tablou electric', factorIds: [factorId] });
  });

  it('takes a zone of its own measures only', () => {
    expect(
      riskZoneRequestSchema.parse({ name: 'Acoperiș', measures: 'Centură' }).factorIds
    ).toEqual([]);
  });

  it('refuses a zone with neither, on its measures', () => {
    const result = riskZoneRequestSchema.safeParse({
      name: 'Acoperiș',
      measures: null,
      factorIds: [],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['measures']]);
  });

  it('refuses a name of one letter', () => {
    expect(riskZoneRequestSchema.safeParse({ name: ' A ', measures: 'x' }).success).toBe(false);
  });
});

describe('updateRiskZonesStateRequestSchema', () => {
  it('never takes listed, which the database keeps', () => {
    expect(updateRiskZonesStateRequestSchema.safeParse({ state: 'listed' }).success).toBe(false);
    expect(updateRiskZonesStateRequestSchema.parse({ state: 'none' })).toEqual({ state: 'none' });
  });
});
