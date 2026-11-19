import { createFileRoute } from '@tanstack/react-router';

import { TestBank } from '@/features/knowledge-tests/test-bank';

export const Route = createFileRoute('/_authenticated/teste/_bank/su-anual')({
  staticData: { title: 'SU anual' },
  component: FireSafetyAnnualTest,
});

function FireSafetyAnnualTest() {
  return <TestBank domain="su" test="annual" />;
}
