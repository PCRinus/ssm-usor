import type { EmployeesOverStep } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';

export async function employeesOverStepOf(
  db: AdminClient,
  organizationId: string
): Promise<EmployeesOverStep | null> {
  const { data, error } = await db
    .rpc('employees_over_step', { p_organization_id: organizationId })
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'employees over step');
  if (!data?.over_since || !data.last_day) return null;
  return {
    since: new Date(data.over_since).toISOString(),
    lastDay: data.last_day,
    blocked: data.blocked,
  };
}
