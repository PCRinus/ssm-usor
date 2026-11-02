import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { InstructionLibrary } from '@/features/instructions/instruction-library';

export const Route = createFileRoute('/_authenticated/instructions/_library/su')({
  staticData: { title: 'IPSU' },
  component: FireSafetyLibrary,
});

function FireSafetyLibrary() {
  const { session } = useAuth();
  return <InstructionLibrary domain="su" userId={session?.user.id ?? ''} />;
}
