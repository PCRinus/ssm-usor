import { creditsExtra } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { errorMessage } from '../../lib/errors';
import { loadEntitlementRow } from '../billing/entitlements';
import type { CreditPolicy } from './policy';

export type CreditEntryKind = Database['public']['Enums']['credit_entry_kind'];

export type Balance = {
  granted: number;
  used: number;
  shortfall: number;
  // Null where nothing limits the credits.
  balance: number | null;
  giftLeft: number;
  extra: number;
  extraLeft: number;
  extrasOn: boolean;
};

export type Charge = {
  charged: number;
  refused: boolean;
  balance: number | null;
  giftLeft: number;
  extraBlocks: number;
};

export type CreditsHooks = { blocksBought?: (organizationId: string) => Promise<void> | void };

export type ImportCreditEntry = {
  import_id: string | null;
  kind: CreditEntryKind;
  credits: number;
  import_part: Database['public']['Enums']['import_library_part'] | null;
};

// The generated types take no null for these arguments, though the functions read null as "no
// limit" or "no month before"; leaving them out would make PostgREST look for another function.
const none = null as unknown as never;

function periodArgs(policy: CreditPolicy) {
  const limited = policy.limited ? policy : null;
  return {
    p_period_start: policy.period.start.toISOString(),
    p_period_end: policy.period.end.toISOString(),
    p_allowance: limited?.allowance ?? none,
    p_previous_start: limited?.previous?.period.start.toISOString() ?? none,
    p_previous_end: limited?.previous?.period.end.toISOString() ?? none,
    p_previous_allowance: limited?.previous?.allowance ?? none,
  };
}

export function creditsStore(db: AdminClient, hooks: CreditsHooks = {}) {
  // What the extras can still give: what the month's blocks hold, plus the blocks the ceiling can
  // still buy.
  async function extras(
    organizationId: string,
    policy: CreditPolicy,
    bought: { extra: number; extra_left: number }
  ) {
    // Blocks already bought stay usable whatever the extras are now: they are paid for.
    const off = { extraLeft: bought.extra_left, extrasOn: false };
    if (!policy.limited || policy.blockCents === null) return off;
    const { data, error } = await db
      .from('usage_extras')
      .select('ceiling_cents')
      .eq('organization_id', organizationId)
      .eq('kind', 'credits')
      .maybeSingle();
    if (error) throw fromDatabaseError(error, 'credits ceiling');
    if (!data) return off;
    const blocks = Math.floor(data.ceiling_cents / policy.blockCents);
    return {
      extraLeft: bought.extra_left + Math.max(0, blocks * creditsExtra.blockCredits - bought.extra),
      extrasOn: true,
    };
  }

  return {
    subscription: (organizationId: string) => loadEntitlementRow(db, organizationId),
    async balance(organizationId: string, policy: CreditPolicy): Promise<Balance> {
      const { data, error } = await db
        .rpc('credit_balance', { p_organization_id: organizationId, ...periodArgs(policy) })
        .single();
      if (error) throw fromDatabaseError(error, 'credit balance');
      return {
        granted: data.granted,
        used: data.used,
        shortfall: data.shortfall,
        balance: data.balance,
        giftLeft: data.gift_left,
        extra: data.extra,
        ...(await extras(organizationId, policy, data)),
      };
    },
    async charge(input: {
      organizationId: string;
      policy: CreditPolicy;
      kind: Extract<
        CreditEntryKind,
        'import_start' | 'import_pages' | 'scanned_page' | 'library_part' | 'safety_sheet'
      >;
      credits: number;
      // Null for a reading outside any import, a safety data sheet's (ADR 030).
      importId: string | null;
      fileId?: string;
      page?: number;
      importPart?: Database['public']['Enums']['import_library_part'];
      key: string;
      require: boolean;
    }): Promise<Charge> {
      const { data, error } = await db
        .rpc('charge_credits', {
          p_organization_id: input.organizationId,
          p_kind: input.kind,
          p_credits: input.credits,
          p_import_id: input.importId ?? none,
          p_import_file_id: input.fileId ?? none,
          p_page: input.page ?? none,
          p_key: input.key,
          p_require: input.require,
          ...periodArgs(input.policy),
          ...(input.importPart ? { p_import_part: input.importPart } : {}),
          ...(input.policy.limited && input.policy.blockCents !== null
            ? { p_block_cents: input.policy.blockCents }
            : {}),
        })
        .single();
      if (error) throw fromDatabaseError(error, 'charge credits');
      if (data.extra_blocks > 0 && hooks.blocksBought) {
        try {
          await hooks.blocksBought(input.organizationId);
        } catch (cause) {
          // The daily retry reports what this left.
          console.error(
            `Extra credit blocks of ${input.organizationId} not reported yet: ${errorMessage(cause, 'unknown')}`
          );
        }
      }
      return {
        charged: data.charged,
        refused: data.refused,
        balance: data.balance,
        giftLeft: data.gift_left,
        extraBlocks: data.extra_blocks,
      };
    },
    // A start whose import could not be queued: it is started again, and charged, later.
    async releaseStart(key: string) {
      const { error } = await db
        .from('credit_entries')
        .delete()
        .eq('key', key)
        .eq('kind', 'import_start');
      if (error) throw fromDatabaseError(error, 'release credits');
    },
    async giveBack(importId: string, credits: number, key: string) {
      const { error } = await db.rpc('give_back_import_credits', {
        p_import_id: importId,
        p_credits: credits,
        p_key: key,
      });
      if (error) throw fromDatabaseError(error, 'give back credits');
    },
    async refundSafetySheet(key: string) {
      const { error } = await db.rpc('refund_safety_sheet_credits', { p_key: key });
      if (error) throw fromDatabaseError(error, 'refund safety sheet credits');
    },
    async grant(input: {
      organizationId: string;
      policy: CreditPolicy;
      credits: number;
      reason: string;
      actor: string;
    }) {
      const { data, error } = await db.rpc('grant_credits', {
        p_organization_id: input.organizationId,
        ...periodArgs(input.policy),
        p_credits: input.credits,
        p_reason: input.reason,
        p_actor: input.actor,
      });
      if (error) throw error;
      return data;
    },
    async welcomeGift(organizationId: string, credits: number) {
      const { data, error } = await db.rpc('grant_welcome_gift', {
        p_organization_id: organizationId,
        p_credits: credits,
      });
      if (error) throw fromDatabaseError(error, 'welcome gift');
      return data;
    },
    async importEntries(importIds: string[]): Promise<ImportCreditEntry[]> {
      if (importIds.length === 0) return [];
      const { data, error } = await db
        .from('credit_entries')
        .select('import_id, kind, credits, import_part')
        .in('import_id', importIds);
      if (error) throw fromDatabaseError(error, 'import credits');
      return data;
    },
  };
}

export type CreditsStore = ReturnType<typeof creditsStore>;
