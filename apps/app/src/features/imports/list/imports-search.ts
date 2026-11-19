import { z } from 'zod';

export const importsSearchSchema = z.object({
  status: z.enum(['closed']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export type ImportsSearch = z.infer<typeof importsSearchSchema>;
