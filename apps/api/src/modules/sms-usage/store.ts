import type { SmsRefusalReason } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type Period, type SmsSubscription, smsSubscriptionColumns } from './policy';

export type SmsKind = Database['public']['Enums']['sms_kind'];

export type Claim =
  | { id: string; overage: boolean }
  | { refusal: Extract<SmsRefusalReason, 'sms_allowance_reached' | 'sms_cap_reached'> };

export type PeriodUsage = { used: number; overage: number; granted: number };

// The generated types take no null for these arguments, though the function reads null as
// "no limit"; leaving them out would make PostgREST look for a function without them.
const none = null as unknown as number;

export function smsUsageStore(db: AdminClient) {
  return {
    async subscriptions(organizationIds: string[]) {
      const found = new Map<string, SmsSubscription>();
      if (organizationIds.length === 0) return found;
      const { data, error } = await db
        .from('subscriptions')
        .select(smsSubscriptionColumns)
        .in('organization_id', organizationIds);
      if (error) throw fromDatabaseError(error, 'sms subscriptions');
      for (const row of data) found.set(row.organization_id, row);
      return found;
    },
    async subscription(organizationId: string): Promise<SmsSubscription | null> {
      const { data, error } = await db
        .from('subscriptions')
        .select(smsSubscriptionColumns)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'sms subscription');
      return data;
    },
    async claim(input: {
      organizationId: string;
      kind: SmsKind;
      period: Period;
      allowance: number | null;
      cap: number | null;
    }): Promise<Claim> {
      const { data, error } = await db
        .rpc('claim_sms_send', {
          p_organization_id: input.organizationId,
          p_kind: input.kind,
          p_period_start: input.period.start.toISOString(),
          p_period_end: input.period.end.toISOString(),
          p_allowance: input.allowance ?? none,
          p_cap: input.cap ?? none,
        })
        .single();
      if (error) throw fromDatabaseError(error, 'sms claim');
      if (data.refusal)
        return { refusal: data.refusal as Extract<Claim, { refusal: string }>['refusal'] };
      return { id: data.id, overage: data.overage };
    },
    async markSent(id: string, providerId: string | null, at: Date) {
      const { error } = await db
        .from('sms_sends')
        .update({ sent_at: at.toISOString(), provider_id: providerId })
        .eq('id', id);
      if (error) throw fromDatabaseError(error, 'sms sent');
    },
    async release(id: string) {
      const { error } = await db.from('sms_sends').delete().eq('id', id).is('sent_at', null);
      if (error) throw fromDatabaseError(error, 'sms release');
    },
    async periodUsage(organizationId: string, period: Period): Promise<PeriodUsage> {
      const { data, error } = await db
        .rpc('sms_period_usage', {
          p_organization_id: organizationId,
          p_period_start: period.start.toISOString(),
          p_period_end: period.end.toISOString(),
        })
        .single();
      if (error) throw fromDatabaseError(error, 'sms period usage');
      return data;
    },
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

export type SmsUsageStore = ReturnType<typeof smsUsageStore>;
