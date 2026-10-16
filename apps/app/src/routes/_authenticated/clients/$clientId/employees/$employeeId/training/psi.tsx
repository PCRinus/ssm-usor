import { createFileRoute } from '@tanstack/react-router';

import { EmployeeTrainingTab } from '@/features/trainings/employee-training-tab';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/$employeeId/training/psi'
)({
  staticData: { title: 'Instruire PSI' },
  component: FireSafetyTraining,
});

function FireSafetyTraining() {
  return <EmployeeTrainingTab domain="psi" />;
}
