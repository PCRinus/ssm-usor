import {
  type RiskFactor,
  type RiskFactorRequest,
  type RiskFactorSourceProfile,
  riskLevel,
  riskLevelTotals,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

type Tables = Database['public']['Tables'];

export type RiskFactorFields = Pick<
  Tables['risk_factors']['Row'],
  | 'id'
  | 'component'
  | 'factor_group'
  | 'description'
  | 'gravity_class'
  | 'probability_class'
  | 'actions'
  | 'deadline'
  | 'responsible_person'
  | 'observations'
  | 'sort_order'
  | 'created_at'
  | 'updated_at'
>;

export type PreventionMeasureFields = Pick<
  Tables['prevention_measures']['Row'],
  'id' | 'kind' | 'description' | 'sort_order'
>;

export const riskFactorFieldColumns =
  'id, component, factor_group, description, gravity_class, probability_class, actions, deadline, responsible_person, observations, sort_order, created_at, updated_at';

export const preventionMeasureFieldColumns = 'id, kind, description, sort_order';

export const bySortOrder = (
  a: { sort_order: number; id: string },
  b: { sort_order: number; id: string }
) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

export function toRiskFactor(
  factor: RiskFactorFields,
  measures: PreventionMeasureFields[],
  sourceProfile: RiskFactorSourceProfile | null = null
): RiskFactor {
  return {
    id: factor.id,
    component: factor.component,
    group: factor.factor_group,
    description: factor.description,
    gravityClass: factor.gravity_class,
    probabilityClass: factor.probability_class,
    riskLevel: riskLevel(factor.gravity_class, factor.probability_class),
    measures: [...measures].sort(bySortOrder).map((measure) => ({
      id: measure.id,
      kind: measure.kind,
      description: measure.description,
    })),
    actions: factor.actions,
    deadline: factor.deadline,
    responsiblePerson: factor.responsible_person,
    observations: factor.observations,
    sourceProfile,
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
  };
}

export function factorTotals(
  factors: Pick<RiskFactorFields, 'gravity_class' | 'probability_class'>[]
) {
  const classed = factors.map((f) => ({
    gravityClass: f.gravity_class,
    probabilityClass: f.probability_class,
  }));
  return { ...riskLevelTotals(classed), factorCount: classed.length };
}

export function riskFactorArgs(body: RiskFactorRequest) {
  return {
    p_component: body.component,
    p_factor_group: body.group,
    p_description: body.description,
    p_gravity_class: body.gravityClass,
    p_probability_class: body.probabilityClass,
    p_measures: body.measures,
    // Left out, the database sets null: the generated types do not take null for these.
    p_actions: body.actions ?? undefined,
    p_deadline: body.deadline ?? undefined,
    p_responsible_person: body.responsiblePerson ?? undefined,
    p_observations: body.observations ?? undefined,
  };
}
