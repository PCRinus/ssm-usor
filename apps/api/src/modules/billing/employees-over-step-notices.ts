import type { EmployeesOverStepNoticeKind, MailService } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { type NoticeRecipient, noticeRecipient } from '../sms-usage/notices';
import { smsUsageStore } from '../sms-usage/store';

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type EmployeesOverStepNoticeDeps = {
  db: AdminClient;
  store: Pick<ReturnType<typeof smsUsageStore>, 'recordNotice' | 'forgetNotice'>;
  recipient: (organizationId: string) => Promise<NoticeRecipient | null>;
  mail: MailService | undefined;
  subscriptionUrl: string;
};

export async function sendEmployeesOverStepNotices(
  deps: EmployeesOverStepNoticeDeps,
  organizationId?: string
): Promise<EmployeesOverStepNoticeKind[]> {
  const { data, error } = await deps.db.rpc('employees_over_step_notices_due');
  if (error) throw fromDatabaseError(error, 'employees over step notices');
  const sent: EmployeesOverStepNoticeKind[] = [];
  for (const due of data) {
    if (organizationId && due.organization_id !== organizationId) continue;
    const kind = due.kind as EmployeesOverStepNoticeKind;
    // Recorded before it is sent, so two requests at once, or a retry, send it once.
    if (!(await deps.store.recordNotice(due.organization_id, due.over_since, kind))) continue;
    try {
      if (!deps.mail) throw new Error('No MAIL binding');
      const recipient = await deps.recipient(due.organization_id);
      if (!recipient) {
        console.error(`Organization ${due.organization_id} has no owner to tell of ${kind}.`);
        continue;
      }
      await deps.mail.sendEmployeesOverStepNotice({
        to: recipient.to,
        kind,
        organizationName: recipient.organizationName,
        employees: due.employees,
        limit: due.employee_limit,
        lastDay: due.last_day,
        subscriptionUrl: deps.subscriptionUrl,
      });
      sent.push(kind);
    } catch (failure) {
      // Taken back so that the next request or the daily run tries again.
      await deps.store.forgetNotice(due.organization_id, due.over_since, kind).catch(() => {
        console.error(`Notice ${kind} for ${due.organization_id} stays recorded, unsent.`);
      });
      console.error(`Notice ${kind} for ${due.organization_id} not sent: ${describe(failure)}`);
    }
  }
  return sent;
}

function depsOf(env: ApiEnv['Bindings']): EmployeesOverStepNoticeDeps {
  const db = adminClient(env);
  return {
    db,
    store: smsUsageStore(db),
    recipient: (organizationId) => noticeRecipient(db, organizationId),
    mail: env.MAIL,
    subscriptionUrl: new URL('/organizatie/abonament', appOrigin(env)).href,
  };
}

// After a change that may have passed the step, so the owner hears of it the same day; the daily
// run catches what this misses.
export function noticeEmployeesOverStepLater(c: Context<ApiEnv>) {
  if (!c.env.MAIL) return;
  const organizationId = c.get('membership').organizationId;
  const run = Promise.resolve()
    .then(() => sendEmployeesOverStepNotices(depsOf(c.env), organizationId))
    .catch((failure) => {
      console.error(`Employees over step notice for ${organizationId}: ${describe(failure)}`);
    });
  try {
    c.executionCtx.waitUntil(run);
  } catch {
    void run;
  }
}

// The limit also moves with time alone, at a trial's end, so every clock is checked first.
export async function scheduledEmployeesOverStep(env: ApiEnv['Bindings']) {
  try {
    const deps = depsOf(env);
    const refreshed = await deps.db.rpc('refresh_all_employees_over_step');
    if (refreshed.error) throw fromDatabaseError(refreshed.error, 'refresh employees over step');
    const sent = await sendEmployeesOverStepNotices(deps);
    if (sent.length > 0) console.log(`Employees over step notices sent: ${sent.length}.`);
  } catch (failure) {
    console.error(`Employees over step run failed: ${describe(failure)}`);
  }
}
