import { createFileRoute } from '@tanstack/react-router';

import { TestBank } from '@/features/knowledge-tests/test-bank';

export const Route = createFileRoute('/_authenticated/teste/_bank/ssm')({
  staticData: { title: 'SSM la angajare' },
  component: OccupationalSafetyHiringTest,
});

function OccupationalSafetyHiringTest() {
  return <TestBank domain="ssm" test="hiring" />;
}
