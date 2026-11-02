import { createFileRoute } from '@tanstack/react-router';

import { EmployeeTrainingTab } from '@/features/trainings/employee-training-tab';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/instruire/ssm'
)({
  staticData: { title: 'Instruire SSM' },
  component: OccupationalSafetyTraining,
});

function OccupationalSafetyTraining() {
  return <EmployeeTrainingTab domain="ssm" />;
}
