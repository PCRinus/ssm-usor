import { z } from 'zod';

import { membershipSchema } from './organizations';
import { profileSchema } from './profile';

export * from './caen';
export * from './clients';
export * from './cnp';
export * from './counties';
export * from './cui';
export * from './document-data';
export * from './documents';
export * from './employees';
export * from './invitations';
export * from './job-positions';
export * from './list';
export * from './mail';
export * from './organizations';
export * from './pdf';
export * from './profile';
export * from './waitlist';

export const leadApplicationSchema = z.object({
  email: z.email(),
  providerName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  clientCount: z.enum(['1-10', '11-30', '31-75', '76+']),
  consentVersion: z.string().trim().min(1),
});

export type LeadApplication = z.infer<typeof leadApplicationSchema>;

export const apiHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('ssm-usor-api'),
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

export const meResponseSchema = z.object({
  user: currentUserSchema,
  // Null until the person has named themselves.
  profile: profileSchema.nullable(),
  // Null for an account that belongs to no organization. During an impersonation this is
  // the impersonated user's membership, while `user` and `profile` stay the caller's own.
  membership: membershipSchema.nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const apiErrorCodeSchema = z.enum([
  'unauthorized',
  'forbidden',
  'validation_error',
  'not_found',
  'conflict',
  'service_unavailable',
  'internal_error',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: apiErrorCodeSchema,
  message: z.string(),
  // Field-level details for validation errors; paths use dot notation.
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  // A stable identifier for errors a client words itself, such as `already_member`.
  reason: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
