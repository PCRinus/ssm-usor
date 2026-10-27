import { billingIntervalSchema, paidPlanSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

const quantity = z.coerce.number().int().min(0).max(100).optional().catch(undefined);

export const choosePlanSearch = z.object({
  plan: paidPlanSchema.optional().catch(undefined),
  interval: billingIntervalSchema.optional().catch(undefined),
  packs: quantity,
  members: quantity,
});

export type ChoosePlanSearch = z.infer<typeof choosePlanSearch>;
