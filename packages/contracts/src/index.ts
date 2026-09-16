import { z } from 'zod';

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

export const meResponseSchema = z.object({ user: currentUserSchema });

export type MeResponse = z.infer<typeof meResponseSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.enum(['unauthorized', 'service_unavailable', 'not_found', 'internal_error']),
  message: z.string(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
