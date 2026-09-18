import { z } from 'zod';

import { fullNameField } from '../account/profile-schema';

export const onboardingSchema = z.object({
  fullName: fullNameField,
  // Same bounds as `organizationNameSchema` in the contracts.
  organizationName: z
    .string()
    .trim()
    .min(2, 'Completează numele organizației.')
    .max(160, 'Numele poate avea cel mult 160 de caractere.'),
  acceptsTerms: z.boolean().refine((accepted) => accepted, {
    message: 'Pentru a continua trebuie să accepți termenii.',
  }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
