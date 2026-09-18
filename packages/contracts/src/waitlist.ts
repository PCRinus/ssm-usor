import { z } from 'zod';

export const waitlistSubscribeRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // The version of the consent text shown next to the form.
  consentVersion: z.string().trim().min(1).max(40),
  turnstileToken: z.string().min(1).max(2048),
});

export type WaitlistSubscribeRequest = z.infer<typeof waitlistSubscribeRequestSchema>;

// The same answer whether the address is new, pending, or already confirmed,
// so the endpoint cannot be used to find out who subscribed.
export const waitlistSubscribeResponseSchema = z.object({
  status: z.literal('confirmation_pending'),
});

export type WaitlistSubscribeResponse = z.infer<typeof waitlistSubscribeResponseSchema>;

// Lenient on purpose: the link is opened in a browser, so a damaged token leads to the
// invalid-link page instead of a JSON validation error.
export const waitlistConfirmQuerySchema = z.object({
  token: z.string().max(200).optional(),
});
