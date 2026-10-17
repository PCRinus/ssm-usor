import { createFileRoute } from '@tanstack/react-router';

import { ParticipationPicker } from '@/features/participation/participation-picker';

export const Route = createFileRoute('/_participant/alege')({
  component: ParticipationPicker,
});
