import type { RouteHandler } from '@hono/zod-openapi';
import type { DashboardSummary } from '@ssm-usor/contracts';

import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import type { getDashboardSummaryRoute } from './routes';

const summaryColumns =
  'ssm_overdue, ssm_due, ssm_untrained, ssm_current, psi_overdue, psi_due, psi_untrained, psi_current, employees, next_due_on, next_due_count, tests_pending, drafts_to_issue, documents_behind, clients_missing_data, employee_signatures_pending, employee_signatures_oldest_issued_at, active_clients, contracts_received_to_confirm, contracts_ending_within_60_days';

export const getDashboardSummary: RouteHandler<typeof getDashboardSummaryRoute, ApiEnv> = async (
  c
) => {
  const { organizationId, role } = c.get('membership');
  const db = createDataClient(c);

  const [summary, months, mySignatures] = await Promise.all([
    db
      .from('dashboard_summary')
      .select(summaryColumns)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db.rpc('dashboard_employees_at_month_ends', { p_organization_id: organizationId }),
    // The predicates of GET /me/signature-requests, so the count matches the page it links to;
    // the inner join drops, as that list does, a request on a client the caller may not read.
    db
      .from('signature_requests')
      .select('id, clients!signature_requests_client_id_fkey!inner(id)', {
        count: 'exact',
        head: true,
      })
      .eq('signer_account_id', c.get('user').id)
      .eq('organization_id', organizationId)
      .neq('slot', 'trainee')
      .eq('state', 'pending'),
  ]);
  if (summary.error) throw fromDatabaseError(summary.error, 'dashboard summary');
  if (months.error) throw fromDatabaseError(months.error, 'dashboard month ends');
  if (mySignatures.error) throw fromDatabaseError(mySignatures.error, 'my pending signatures');

  const row = summary.data;
  const count = (value: number | null | undefined) => value ?? 0;
  const employees = count(row?.employees);
  const oldestIssuedAt = row?.employee_signatures_oldest_issued_at;
  const nextDueOn = row?.next_due_on;

  return c.json(
    {
      todo: {
        mySignatures: count(mySignatures.count),
        draftsToIssue: count(row?.drafts_to_issue),
        clientsMissingData: count(row?.clients_missing_data),
        documentsBehind: count(row?.documents_behind),
        employeeSignatures: {
          pending: count(row?.employee_signatures_pending),
          oldestIssuedAt: oldestIssuedAt ? new Date(oldestIssuedAt).toISOString() : null,
        },
        testsPending: count(row?.tests_pending),
      },
      trainings: {
        ssm: {
          overdue: count(row?.ssm_overdue),
          due: count(row?.ssm_due),
          untrained: count(row?.ssm_untrained),
          current: count(row?.ssm_current),
          total: employees,
        },
        psi: {
          overdue: count(row?.psi_overdue),
          due: count(row?.psi_due),
          untrained: count(row?.psi_untrained),
          current: count(row?.psi_current),
          total: employees,
        },
      },
      nextDue: nextDueOn ? { on: nextDueOn, employees: count(row?.next_due_count) } : null,
      portfolio: {
        activeClients: count(row?.active_clients),
        employees,
        employeesAtMonthEnds: months.data.map((month) => ({
          month: month.month.slice(0, 7),
          employees: month.employees,
        })),
      },
      // The policies already hide contracts from a specialist, who would read zeros; null tells
      // the page there is no card to show rather than an empty one.
      contracts:
        role === 'owner'
          ? {
              receivedToConfirm: count(row?.contracts_received_to_confirm),
              endingWithin60Days: count(row?.contracts_ending_within_60_days),
            }
          : null,
    } satisfies DashboardSummary,
    200
  );
};
