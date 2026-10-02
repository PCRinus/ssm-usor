import { randomUUID } from 'node:crypto';

import type { Database } from '../../src/database.types';
import {
  officeEvaluation,
  type RiskEvaluationFixture,
  workshopEvaluation,
} from '../../src/modules/documents/risk-evaluations.fixture';
import type { SeedClient } from './seed-organization';

type Tables = Database['public']['Tables'];
type ProfileInsert = Tables['evaluation_profiles']['Insert'];
type FactorInsert = Tables['evaluation_profile_factors']['Insert'];
type MeasureInsert = Tables['evaluation_profile_measures']['Insert'];

export const seededProfiles: [string, RiskEvaluationFixture][] = [
  ['Lucrător de birou', officeEvaluation],
  ['Lucrător în atelier', workshopEvaluation],
];

export function profileRows(
  owner: { organizationId: string; createdBy: string },
  name: string,
  fixture: RiskEvaluationFixture,
  newId: () => string = randomUUID
) {
  const common = { organization_id: owner.organizationId, created_by: owner.createdBy };
  const profileId = newId();
  const factors: FactorInsert[] = [];
  const measures: MeasureInsert[] = [];
  fixture.factors.forEach((factor, factorIndex) => {
    const factorId = newId();
    factors.push({
      ...common,
      id: factorId,
      profile_id: profileId,
      component: factor.component,
      factor_group: factor.group,
      description: factor.description,
      gravity_class: factor.gravityClass,
      probability_class: factor.probabilityClass,
      actions: factor.actions,
      deadline: factor.deadline,
      responsible_person: factor.responsiblePerson,
      observations: factor.observations,
      sort_order: factorIndex,
    });
    factor.measures.forEach((measure, measureIndex) => {
      measures.push({
        ...common,
        factor_id: factorId,
        kind: measure.kind,
        description: measure.description,
        sort_order: measureIndex,
      });
    });
  });
  const profile: ProfileInsert = { ...common, id: profileId, name };
  return { profile, factors, measures };
}

// A profile of the same name is left as it is, so a rerun keeps what was changed by hand.
export async function seedEvaluationProfiles(
  db: SeedClient,
  organizationId: string,
  createdBy: string
) {
  const existing = await db
    .from('evaluation_profiles')
    .select('name')
    .eq('organization_id', organizationId);
  if (existing.error) {
    throw new Error(`Could not read evaluation profiles: ${existing.error.message}`);
  }
  const taken = new Set(existing.data.map((row) => row.name.trim().toLocaleLowerCase('ro')));
  const seeded = seededProfiles
    .filter(([name]) => !taken.has(name.toLocaleLowerCase('ro')))
    .map(([name, fixture]) => profileRows({ organizationId, createdBy }, name, fixture));
  if (seeded.length === 0) return 0;
  const profiles = await db.from('evaluation_profiles').insert(seeded.map((rows) => rows.profile));
  if (profiles.error) throw new Error(`Could not seed profiles: ${profiles.error.message}`);
  const factors = await db
    .from('evaluation_profile_factors')
    .insert(seeded.flatMap((rows) => rows.factors));
  if (factors.error) throw new Error(`Could not seed profile factors: ${factors.error.message}`);
  const measures = await db
    .from('evaluation_profile_measures')
    .insert(seeded.flatMap((rows) => rows.measures));
  if (measures.error) {
    throw new Error(`Could not seed profile measures: ${measures.error.message}`);
  }
  return seeded.length;
}
