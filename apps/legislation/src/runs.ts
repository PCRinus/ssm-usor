import type { LegislationClient } from '@ssm-usor/legislation-check';

export async function lastSucceededRunStart(db: LegislationClient) {
  const found = await db
    .from('legal_check_runs')
    .select('started_at')
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (found.error) {
    throw new Error(`Could not look for the last successful run: ${found.error.message}`);
  }
  return found.data?.started_at ?? null;
}
