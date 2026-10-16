import { trainingDomains, trainingPhases } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ClientTrainingsPage } from '@/features/trainings/client-trainings-page';

const searchSchema = z.object({
  domain: z.enum(trainingDomains).optional().catch(undefined),
  phase: z.enum(trainingPhases).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clients/$clientId/trainings')({
  staticData: { title: 'Instruiri ținute' },
  validateSearch: searchSchema,
  component: ClientTrainingsPage,
});
