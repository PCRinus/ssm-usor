import { createFileRoute } from '@tanstack/react-router';

import { TrainingPage } from '@/features/training/training-page';

export const Route = createFileRoute('/_participant/_portal/instruiri/')({
  component: TrainingPage,
});
