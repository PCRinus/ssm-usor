import { z } from 'zod';

/** Mirrors the `organization_role` enum in the database. */
export const organizationRoleSchema = z.enum(['owner', 'specialist']);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
