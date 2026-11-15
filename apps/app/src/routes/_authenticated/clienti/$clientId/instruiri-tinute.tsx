import { createFileRoute } from '@tanstack/react-router';

import { ClientTrainingsPage } from '@/features/trainings/client-trainings-page';
import { clientTrainingsSearchSchema } from '@/features/trainings/training-filters';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/instruiri-tinute')({
  staticData: { title: 'Instruiri ținute' },
  validateSearch: clientTrainingsSearchSchema,
  component: ClientTrainingsPage,
});
