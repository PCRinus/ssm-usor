import { z } from 'zod';

const countSchema = z.int().min(0);

export const dashboardTrainingCountsSchema = z
  .object({
    overdue: countSchema,
    due: countSchema,
    untrained: countSchema,
    current: countSchema,
    // Every employee has a state in both domains, so both totals are the same headcount.
    total: countSchema,
  })
  .meta({ id: 'DashboardTrainingCounts' });

export type DashboardTrainingCounts = z.infer<typeof dashboardTrainingCountsSchema>;

export const dashboardSummarySchema = z.object({
  todo: z.object({
    // The caller's own pending slots, as `GET /me/signature-requests` lists them.
    mySignatures: countSchema,
    draftsToIssue: countSchema,
    // Only the basic part of the readiness check (ADR 027).
    clientsMissingData: countSchema,
    documentsBehind: countSchema,
    employeeSignatures: z.object({
      pending: countSchema,
      oldestIssuedAt: z.iso.datetime({ offset: true }).nullable(),
    }),
    testsPending: countSchema,
  }),
  trainings: z.object({
    ssm: dashboardTrainingCountsSchema,
    psi: dashboardTrainingCountsSchema,
  }),
  // The nearest training due date in either domain among employees current or due.
  nextDue: z.object({ on: z.iso.date(), employees: countSchema }).nullable(),
  portfolio: z.object({
    activeClients: countSchema,
    employees: countSchema,
    // Twelve months, oldest first, the current month counted up to today.
    employeesAtMonthEnds: z.array(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), employees: countSchema })
    ),
  }),
  // Null for a member who is not an owner.
  contracts: z
    .object({ receivedToConfirm: countSchema, endingWithin60Days: countSchema })
    .nullable(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
