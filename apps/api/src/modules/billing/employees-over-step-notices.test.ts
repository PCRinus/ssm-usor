import type { MailService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AdminClient } from '../../lib/admin-db';
import {
  type EmployeesOverStepNoticeDeps,
  sendEmployeesOverStepNotices,
} from './employees-over-step-notices';

const due = (organizationId: string, kind = 'employees_over') => ({
  organization_id: organizationId,
  over_since: '2026-11-02T10:00:00+00:00',
  kind,
  employees: 262,
  employee_limit: 250,
  last_day: '2026-12-02',
});

function depsWith(rows: ReturnType<typeof due>[], recorded = true) {
  const sendEmployeesOverStepNotice = vi.fn(async () => ({ id: 'msg_1' }));
  const deps = {
    db: { rpc: vi.fn(async () => ({ data: rows, error: null })) } as unknown as AdminClient,
    store: {
      recordNotice: vi.fn(async () => recorded),
      forgetNotice: vi.fn(async () => {}),
    },
    recipient: vi.fn<EmployeesOverStepNoticeDeps['recipient']>(async () => ({
      to: 'olga@exemplu.example',
      organizationName: 'Prevenire',
    })),
    mail: { sendEmployeesOverStepNotice } as unknown as MailService,
    subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
  } satisfies EmployeesOverStepNoticeDeps;
  return { deps, sendEmployeesOverStepNotice };
}

describe('employees over the step notices', () => {
  it('records each due notice for its clock, then tells the owner the counts and the last day', async () => {
    const { deps, sendEmployeesOverStepNotice } = depsWith([due('org-1')]);

    expect(await sendEmployeesOverStepNotices(deps)).toEqual(['employees_over']);
    expect(deps.store.recordNotice).toHaveBeenCalledWith(
      'org-1',
      '2026-11-02T10:00:00+00:00',
      'employees_over'
    );
    expect(sendEmployeesOverStepNotice).toHaveBeenCalledWith({
      to: 'olga@exemplu.example',
      kind: 'employees_over',
      organizationName: 'Prevenire',
      employees: 262,
      limit: 250,
      lastDay: '2026-12-02',
      subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
    });
  });

  it('sends nothing already recorded', async () => {
    const { deps, sendEmployeesOverStepNotice } = depsWith([due('org-1')], false);

    expect(await sendEmployeesOverStepNotices(deps)).toEqual([]);
    expect(sendEmployeesOverStepNotice).not.toHaveBeenCalled();
  });

  it("after a change, sends only the organization's own", async () => {
    const { deps } = depsWith([due('org-1'), due('org-2', 'employees_soon')]);

    expect(await sendEmployeesOverStepNotices(deps, 'org-2')).toEqual(['employees_soon']);
    expect(deps.store.recordNotice).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing recorded when the organization has no owner to tell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, sendEmployeesOverStepNotice } = depsWith([due('org-1')]);
    deps.recipient.mockResolvedValueOnce(null);

    expect(await sendEmployeesOverStepNotices(deps)).toEqual([]);
    expect(sendEmployeesOverStepNotice).not.toHaveBeenCalled();
    expect(deps.store.forgetNotice).toHaveBeenCalledWith(
      'org-1',
      '2026-11-02T10:00:00+00:00',
      'employees_over'
    );
  });

  it('takes a failed send back so the next run tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, sendEmployeesOverStepNotice } = depsWith([due('org-1')]);
    sendEmployeesOverStepNotice.mockRejectedValueOnce(new Error('provider down'));

    expect(await sendEmployeesOverStepNotices(deps)).toEqual([]);
    expect(deps.store.forgetNotice).toHaveBeenCalledWith(
      'org-1',
      '2026-11-02T10:00:00+00:00',
      'employees_over'
    );
  });
});
