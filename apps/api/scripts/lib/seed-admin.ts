import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';

export const seedConfigSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SEED_ADMIN_EMAIL: z.email().default('admin@ssmusor.test'),
  SEED_ADMIN_PASSWORD: z.string().min(6).default('admin123'),
  SEED_ORGANIZATION_NAME: z.string().trim().min(2).max(160).default('SSM Ușor'),
});

const seedMarker = 'ssm-usor-development-admin';
const pageSize = 1000;

// Refuse to overwrite an unrelated account if the configured email is already taken.
export async function seedAdmin(
  admin: SupabaseClient['auth']['admin'],
  email: string,
  password: string,
  options: { resetPassword?: boolean } = {}
) {
  let existing: User | undefined;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: pageSize });
    if (error) throw new Error(`Could not find the seed account: ${error.message}`);
    existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing || data.users.length < pageSize) break;
  }

  if (existing && existing.app_metadata.seed !== seedMarker) {
    throw new Error(
      'This email belongs to an account not managed by the development seed. Choose a different SEED_ADMIN_EMAIL.'
    );
  }

  // The password is set when the account is created, and on rerun only when asked.
  const attributes = {
    email,
    email_confirm: true,
    app_metadata: { ...existing?.app_metadata, role: 'admin', seed: seedMarker },
  };
  const { data, error } = existing
    ? await admin.updateUserById(existing.id, {
        ...attributes,
        ...(options.resetPassword ? { password } : {}),
      })
    : await admin.createUser({ ...attributes, password });
  if (error) throw new Error(`Could not seed the admin: ${error.message}`);
  if (!data.user) throw new Error('Supabase did not return the seeded user.');
  return { user: data.user, action: existing ? 'Updated' : 'Created' };
}
