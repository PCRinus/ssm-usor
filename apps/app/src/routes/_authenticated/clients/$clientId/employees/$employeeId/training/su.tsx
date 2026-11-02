import { createFileRoute } from '@tanstack/react-router';

import { EmployeeTrainingTab } from '@/features/trainings/employee-training-tab';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/$employeeId/training/su'
)({
  staticData: { title: 'Instruire SU' },
  component: FireSafetyTraining,
});

function FireSafetyTraining() {
  return <EmployeeTrainingTab domain="su" />;
}
