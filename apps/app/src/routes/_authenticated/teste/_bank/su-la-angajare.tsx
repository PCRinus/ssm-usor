import { createFileRoute } from '@tanstack/react-router';

import { TestBank } from '@/features/knowledge-tests/test-bank';

export const Route = createFileRoute('/_authenticated/teste/_bank/su-la-angajare')({
  staticData: { title: 'SU la angajare' },
  component: FireSafetyHiringTest,
});

function FireSafetyHiringTest() {
  return <TestBank domain="su" test="hiring" />;
}
