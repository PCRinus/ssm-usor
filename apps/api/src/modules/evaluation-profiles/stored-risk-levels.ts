import { riskLevelTotals } from '@ssm-usor/contracts';

import type { DataClient } from '../../lib/db';

// Every write that changes an entry's factors calls this after it, in the same top-level
// function; stored-risk-levels.test.ts fails on one that does not.
export async function storeRiskLevels(db: DataClient, profileIds: readonly string[]) {
  const ids = [...new Set(profileIds)];
  if (ids.length === 0) return;
  // The factors are already written, so a failure here leaves the list's level behind until
  // the next change rather than failing the change.
  const { data, error } = await db
    .from('evaluation_profiles')
    .select('id, evaluation_profile_factors(gravity_class, probability_class)')
    .in('id', ids);
  if (error) {
    console.error(`The risk levels of ${ids.length} library entries were not read: ${error.code}`);
    return;
  }
  const results = await Promise.all(
    data.map((row) => {
      const totals = riskLevelTotals(
        row.evaluation_profile_factors.map((factor) => ({
          gravityClass: factor.gravity_class,
          probabilityClass: factor.probability_class,
        }))
      );
      return db
        .from('evaluation_profiles')
        .update({
          global_risk_level: totals.globalRiskLevel,
          unacceptable_factor_count: totals.unacceptableFactorCount,
        })
        .eq('id', row.id);
    })
  );
  for (const { error: failed } of results) {
    if (failed) console.error(`The risk levels of a library entry were not kept: ${failed.code}`);
  }
}

// A store that failed leaves an entry with factors and no level, which would read and filter as
// one without factors; the next list read writes it.
export async function storeMissingRiskLevels(db: DataClient) {
  const { data, error } = await db
    .from('evaluation_profiles')
    .select('id, evaluation_profile_factors!inner(id)')
    .is('global_risk_level', null)
    .limit(1, { referencedTable: 'evaluation_profile_factors' });
  if (error) {
    console.error(`The library entries missing their risk levels were not read: ${error.code}`);
    return;
  }
  await storeRiskLevels(
    db,
    data.map((row) => row.id)
  );
}
