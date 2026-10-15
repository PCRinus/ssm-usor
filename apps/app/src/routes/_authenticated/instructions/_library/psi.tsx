import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { InstructionLibrary } from '@/features/instructions/instruction-library';

export const Route = createFileRoute('/_authenticated/instructions/_library/psi')({
  staticData: { title: 'PSI' },
  component: FireSafetyLibrary,
});

function FireSafetyLibrary() {
  const { session } = useAuth();
  return <InstructionLibrary domain="psi" userId={session?.user.id ?? ''} />;
}
