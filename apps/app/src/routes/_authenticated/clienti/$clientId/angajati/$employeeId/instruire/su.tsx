import { createFileRoute } from '@tanstack/react-router';

import { keepOpener } from '@/app/opener';
import { EmployeeTrainingTab } from '@/features/trainings/employee-training-tab';
import { ownTrainingsSearchSchema } from '@/features/trainings/training-filters';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/instruire/su'
)({
  staticData: { title: 'Instruire SU' },
  validateSearch: ownTrainingsSearchSchema,
  component: FireSafetyTraining,
});

function FireSafetyTraining() {
  const navigate = Route.useNavigate();
  return (
    <EmployeeTrainingTab
      domain="su"
      search={Route.useSearch()}
      onSearch={(next) =>
        void navigate({
          state: keepOpener,
          replace: true,
          resetScroll: false,
          search: (prev) => ({ ...prev, ...next }),
        })
      }
    />
  );
}
