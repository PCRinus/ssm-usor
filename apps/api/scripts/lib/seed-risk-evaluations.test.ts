import { riskLevel } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  officeEvaluation,
  sensitiveGroupsEvaluation,
  workshopEvaluation,
} from '../../src/modules/documents/risk-evaluations.fixture';
import { evaluationFor, evaluationRows } from './seed-risk-evaluations';

const subject = { organizationId: 'org', clientId: 'client', createdBy: 'user' };

describe('evaluationFor', () => {
  it('gives office posts the office evaluation, and every other post the workshop one', () => {
    expect(evaluationFor('Contabil')).toBe(officeEvaluation);
    expect(evaluationFor('Sudor')).toBe(workshopEvaluation);
  });
});

describe('the fixture evaluations', () => {
  it.each([
    ['office', officeEvaluation],
    ['workshop', workshopEvaluation],
    ['sensitive groups', sensitiveGroupsEvaluation],
  ])('of the %s are ready for the documents', (_name, fixture) => {
    for (const factor of fixture.factors) {
      if (riskLevel(factor.gravityClass, factor.probabilityClass) > 3) {
        expect(factor.measures.length).toBeGreaterThan(0);
      }
      if (factor.measures.length > 0) {
        expect(factor.deadline).toBeTruthy();
        expect(factor.responsiblePerson).toBeTruthy();
      }
    }
  });
});

describe('evaluationRows', () => {
  it("links a position's factors and measures, in the fixture's order", () => {
    let next = 0;
    const rows = evaluationRows(
      { ...subject, kind: 'job_position', jobPositionId: 'position' },
      officeEvaluation,
      () => `id-${(next += 1)}`
    );
    expect(rows.evaluation).toMatchObject({
      id: 'id-1',
      organization_id: 'org',
      client_id: 'client',
      kind: 'job_position',
      job_position_id: 'position',
      work_task: null,
      exposed_persons: null,
      created_by: 'user',
    });
    expect(rows.factors).toHaveLength(officeEvaluation.factors.length);
    expect(rows.factors.map((factor) => factor.sort_order)).toEqual(
      officeEvaluation.factors.map((_, index) => index)
    );
    expect(rows.factors.every((factor) => factor.evaluation_id === 'id-1')).toBe(true);
    const measured = rows.factors[1]!;
    expect(rows.measures.filter((measure) => measure.factor_id === measured.id)).toEqual([
      expect.objectContaining({ kind: 'technical', sort_order: 0 }),
      expect.objectContaining({ kind: 'organizational', sort_order: 1 }),
    ]);
  });

  it('gives the sensitive groups their own work task and exposed persons', () => {
    const rows = evaluationRows(
      { ...subject, kind: 'sensitive_groups' },
      sensitiveGroupsEvaluation
    );
    expect(rows.evaluation).toMatchObject({
      kind: 'sensitive_groups',
      job_position_id: null,
      work_task: sensitiveGroupsEvaluation.workTask,
      exposed_persons: sensitiveGroupsEvaluation.exposedPersons,
    });
  });
});
