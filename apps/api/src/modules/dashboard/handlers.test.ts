import { dashboardSummarySchema, type OrganizationRole } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  membershipRow,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testOrganizationId as organizationId,
  testUser as user,
} from '../../test/upstream';

const summaryRow = {
  ssm_overdue: 3,
  ssm_due: 5,
  ssm_untrained: 2,
  ssm_current: 30,
  su_overdue: 1,
  su_due: 4,
  su_untrained: 6,
  su_current: 29,
  employees: 40,
  next_due_on: '2026-11-02',
  next_due_count: 4,
  tests_pending: 2,
  drafts_to_issue: 7,
  documents_behind: 3,
  clients_missing_data: 1,
  employee_signatures_pending: 9,
  employee_signatures_oldest_issued_at: '2026-10-20T08:30:00+00:00',
  active_clients: 12,
  contracts_received_to_confirm: 2,
  contracts_ending_within_60_days: 1,
};

const monthEnds = [
  '2025-11-01',
  '2025-12-01',
  '2026-01-01',
  '2026-02-01',
  '2026-03-01',
  '2026-04-01',
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
  '2026-09-01',
  '2026-10-01',
].map((month, index) => ({ month, employees: 28 + index }));

function mockUpstream({
  role = 'owner',
  rows = [summaryRow],
  mySignatures = 3,
}: { role?: OrganizationRole; rows?: unknown[]; mySignatures?: number } = {}) {
  mockSignedInUpstream({
    '/rest/v1/rpc/current_membership': () => [membershipRow({ role })],
    '/rest/v1/dashboard_summary': () => rows,
    '/rest/v1/rpc/dashboard_employees_at_month_ends': () => monthEnds,
    '/rest/v1/signature_requests': () =>
      new Response(null, {
        headers: { 'content-range': mySignatures ? `0-0/${mySignatures}` : '*/0' },
      }),
  });
}

const request = () => apiRequest('/dashboard/summary');

stubFetch();

describe('GET /dashboard/summary', () => {
  it("answers an owner with every count of the organization's row, contracts included", async () => {
    mockUpstream();

    const response = await request();

    expect(response.status).toBe(200);
    const body = dashboardSummarySchema.parse(await response.json());
    expect(body).toEqual({
      todo: {
        mySignatures: 3,
        draftsToIssue: 7,
        clientsMissingData: 1,
        documentsBehind: 3,
        employeeSignatures: { pending: 9, oldestIssuedAt: '2026-10-20T08:30:00.000Z' },
        testsPending: 2,
      },
      trainings: {
        ssm: { overdue: 3, due: 5, untrained: 2, current: 30, total: 40 },
        su: { overdue: 1, due: 4, untrained: 6, current: 29, total: 40 },
      },
      nextDue: { on: '2026-11-02', employees: 4 },
      portfolio: {
        activeClients: 12,
        employees: 40,
        employeesAtMonthEnds: body.portfolio.employeesAtMonthEnds,
      },
      contracts: { receivedToConfirm: 2, endingWithin60Days: 1 },
    });
    expect(callsTo('/rest/v1/dashboard_summary')[0]!.url.searchParams.get('organization_id')).toBe(
      `eq.${organizationId}`
    );
    expect(callsTo('/rest/v1/rpc/dashboard_employees_at_month_ends')[0]!.body).toEqual({
      p_organization_id: organizationId,
    });
  });

  it("gives a specialist no contracts and counts only the caller's own pending slots", async () => {
    mockUpstream({ role: 'specialist', mySignatures: 5 });

    const response = await request();

    expect(response.status).toBe(200);
    const body = dashboardSummarySchema.parse(await response.json());
    expect(body.contracts).toBeNull();
    expect(body.todo.mySignatures).toBe(5);
    const { url, method } = callsTo('/rest/v1/signature_requests')[0]!;
    expect(method).toBe('HEAD');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      signer_account_id: `eq.${user.id}`,
      organization_id: `eq.${organizationId}`,
      select: 'id,clients!signature_requests_client_id_fkey!inner(id)',
      slot: 'in.(trainer,verifier,admitter,examiner)',
      state: 'eq.pending',
    });
  });

  it('labels each month end by its year and month, oldest first', async () => {
    mockUpstream();

    const body = dashboardSummarySchema.parse(await (await request()).json());

    expect(body.portfolio.employeesAtMonthEnds).toHaveLength(12);
    expect(body.portfolio.employeesAtMonthEnds[0]).toEqual({ month: '2025-11', employees: 28 });
    expect(body.portfolio.employeesAtMonthEnds.at(-1)).toEqual({ month: '2026-10', employees: 39 });
  });

  it('answers zeros when the organization has no row', async () => {
    mockUpstream({ rows: [], mySignatures: 0 });

    const response = await request();

    expect(response.status).toBe(200);
    const body = dashboardSummarySchema.parse(await response.json());
    expect(body.todo).toEqual({
      mySignatures: 0,
      draftsToIssue: 0,
      clientsMissingData: 0,
      documentsBehind: 0,
      employeeSignatures: { pending: 0, oldestIssuedAt: null },
      testsPending: 0,
    });
    expect(body.trainings.ssm).toEqual({ overdue: 0, due: 0, untrained: 0, current: 0, total: 0 });
    expect(body.nextDue).toBeNull();
    expect(body.portfolio.activeClients).toBe(0);
    expect(body.contracts).toEqual({ receivedToConfirm: 0, endingWithin60Days: 0 });
  });
});
