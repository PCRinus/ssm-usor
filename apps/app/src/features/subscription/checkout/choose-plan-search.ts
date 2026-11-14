import { billingIntervalSchema, paidPlanSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

export const choosePlanSearch = z.object({
  plan: paidPlanSchema.optional().catch(undefined),
  interval: billingIntervalSchema.optional().catch(undefined),
  step: z.coerce.number().int().min(0).max(100_000).optional().catch(undefined),
});

export type ChoosePlanSearch = z.infer<typeof choosePlanSearch>;
