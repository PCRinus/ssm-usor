import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { TestBank } from '@/features/knowledge-tests/test-bank';

export const Route = createFileRoute('/_authenticated/tests/_bank/psi')({
  staticData: { title: 'PSI' },
  component: FireSafetyTests,
});

function FireSafetyTests() {
  const { session } = useAuth();
  return <TestBank domain="psi" userId={session?.user.id ?? ''} />;
}
