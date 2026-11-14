import type { ExtraKind } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';

export type Ceilings = Record<ExtraKind, number | null>;

export function extrasStore(db: AdminClient) {
  return {
    async ceilings(organizationId: string): Promise<Ceilings> {
      const { data, error } = await db
        .from('usage_extras')
        .select('kind, ceiling_cents')
        .eq('organization_id', organizationId);
      if (error) throw fromDatabaseError(error, 'usage extras');
      const ceilings: Ceilings = { sms: null, credits: null };
      for (const row of data) ceilings[row.kind] = row.ceiling_cents;
      return ceilings;
    },
    async setCeiling(organizationId: string, kind: ExtraKind, ceilingCents: number | null) {
      const write =
        ceilingCents === null
          ? db.from('usage_extras').delete().eq('organization_id', organizationId).eq('kind', kind)
          : db.from('usage_extras').upsert({
              organization_id: organizationId,
              kind,
              ceiling_cents: ceilingCents,
              updated_at: new Date().toISOString(),
            });
      const { error } = await write;
      if (error) throw fromDatabaseError(error, 'usage extras write');
    },
    async turnOffAll(organizationId: string) {
      const { data, error } = await db
        .from('usage_extras')
        .delete()
        .eq('organization_id', organizationId)
        .select('kind');
      if (error) throw fromDatabaseError(error, 'usage extras off');
      return data.map((row) => row.kind);
    },
  };
}

export type ExtrasStore = ReturnType<typeof extrasStore>;
