import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { focusSearch, trainingFocus } from '@/features/missing-data/focus';
import { ResponsiblePersonsCard } from '@/features/training/responsible-persons-card';
import { TrainingProgramSection } from '@/features/training/training-program-card';

// What a client's generated documentation prints about training and responsible persons
// (ADR 005).
export const Route = createFileRoute('/_authenticated/clients/$clientId/training')({
  staticData: { title: 'Instruire și responsabili' },
  validateSearch: focusSearch(trainingFocus),
  component: TrainingPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function TrainingPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const { focus } = Route.useSearch();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="training-page" className="grid gap-6">
      <TrainingProgramSection
        client={client}
        userId={session.user.id}
        focus={focus === 'training-schedule'}
      />
      <ResponsiblePersonsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        focus={focus === 'training-schedule' ? undefined : focus}
      />
    </div>
  );
}
