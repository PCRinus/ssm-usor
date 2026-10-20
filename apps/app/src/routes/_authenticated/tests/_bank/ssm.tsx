import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { TestBank } from '@/features/knowledge-tests/test-bank';

export const Route = createFileRoute('/_authenticated/tests/_bank/ssm')({
  staticData: { title: 'SSM' },
  component: OccupationalSafetyTests,
});

function OccupationalSafetyTests() {
  const { session } = useAuth();
  return <TestBank domain="ssm" userId={session?.user.id ?? ''} />;
}
