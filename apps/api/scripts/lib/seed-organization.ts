import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/database.types';

// Fixed identifier so reruns update the same organization.
export const seedOrganizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';

export type SeedClient = SupabaseClient<Database>;

export async function seedOrganization(
  db: SeedClient,
  name: string,
  ownerUserId: string,
  ownerName: string
) {
  const organization = await db
    .from('organizations')
    .upsert({ id: seedOrganizationId, name }, { onConflict: 'id' })
    .select('id, name')
    .single();
  if (organization.error) {
    throw new Error(`Could not seed the organization: ${organization.error.message}`);
  }
  const membership = await db
    .from('organization_members')
    .upsert(
      { user_id: ownerUserId, organization_id: seedOrganizationId, role: 'owner' },
      { onConflict: 'user_id' }
    )
    .select('user_id, organization_id, role')
    .single();
  if (membership.error) {
    throw new Error(`Could not seed the owner membership: ${membership.error.message}`);
  }
  // A name the owner has since chosen on their profile page is kept.
  const profile = await db
    .from('profiles')
    .upsert(
      { user_id: ownerUserId, full_name: ownerName },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  if (profile.error) {
    throw new Error(`Could not seed the owner profile: ${profile.error.message}`);
  }
  return { organization: organization.data, membership: membership.data };
}
