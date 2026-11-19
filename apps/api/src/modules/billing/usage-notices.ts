import type { MailService } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type ApiEnv, subscriptionUrl } from '../../lib/env';
import { ownerEmail } from './store';

export type NoticeRecipient = { to: string; organizationName: string };

export function usageNoticeStore(db: AdminClient) {
  return {
    /** False when the notice was already recorded for that month. */
    async recordNotice(organizationId: string, periodStart: string, kind: string) {
      const { error } = await db
        .from('usage_notices')
        .insert({ organization_id: organizationId, period_start: periodStart, kind });
      if (error?.code === '23505') return false;
      if (error) throw fromDatabaseError(error, 'usage notice');
      return true;
    },
    async forgetNotice(organizationId: string, periodStart: string, kind: string) {
      const { error } = await db
        .from('usage_notices')
        .delete()
        .eq('organization_id', organizationId)
        .eq('period_start', periodStart)
        .eq('kind', kind);
      if (error) throw fromDatabaseError(error, 'forget usage notice');
    },
  };
}

type UsageNoticeStore = ReturnType<typeof usageNoticeStore>;

export async function noticeRecipient(
  db: AdminClient,
  organizationId: string
): Promise<NoticeRecipient | null> {
  const [to, organization] = await Promise.all([
    ownerEmail(db, organizationId),
    db.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
  ]);
  if (organization.error) throw fromDatabaseError(organization.error, 'notice organization');
  if (!to || !organization.data) return null;
  return { to, organizationName: organization.data.name };
}

export type NoticeDeps = {
  store: UsageNoticeStore;
  recipient: (organizationId: string) => Promise<NoticeRecipient | null>;
  mail: MailService | undefined;
};

export function noticeDepsFor(env: ApiEnv['Bindings'], db: AdminClient) {
  return {
    store: usageNoticeStore(db),
    recipient: (organizationId: string) => noticeRecipient(db, organizationId),
    mail: env.MAIL,
    subscriptionUrl: () => subscriptionUrl(env),
  } satisfies NoticeDeps & { subscriptionUrl: () => string };
}

// 'unaddressed' stays recorded without an email; 'failed' only when onFailure took the error.
type NoticeOutcome = 'sent' | 'unaddressed' | 'duplicate' | 'failed';

export async function sendNoticeOnce(
  deps: NoticeDeps,
  notice: {
    organizationId: string;
    periodStart: string;
    kind: string;
    // ADR 029: an employees over step notice that finds no owner is not kept as sent, so it goes
    // out once the organization has an owner again; a usage notice stays recorded for the month.
    whenNoRecipient: 'keep' | 'forget';
    // Takes only a failed send: a failure to record still throws, so a run whose store is down
    // stops instead of logging every notice.
    onFailure?: (error: unknown) => void;
  },
  send: (mail: MailService, recipient: NoticeRecipient) => Promise<unknown>
): Promise<NoticeOutcome> {
  const { organizationId, periodStart, kind } = notice;
  // Recorded before it is sent, so two attempts at once, or a retry, send it once.
  if (!(await deps.store.recordNotice(organizationId, periodStart, kind))) return 'duplicate';
  try {
    if (!deps.mail) throw new Error('No MAIL binding');
    const recipient = await deps.recipient(organizationId);
    if (!recipient) {
      if (notice.whenNoRecipient === 'forget') throw new Error('no owner to tell');
      console.error(`Organization ${organizationId} has no owner to tell of ${kind}.`);
      return 'unaddressed';
    }
    await send(deps.mail, recipient);
    return 'sent';
  } catch (error) {
    // Taken back so that the next attempt tries again.
    await deps.store.forgetNotice(organizationId, periodStart, kind).catch(() => {
      console.error(`Notice ${kind} for ${organizationId} stays recorded, unsent.`);
    });
    if (!notice.onFailure) throw error;
    notice.onFailure(error);
    return 'failed';
  }
}
