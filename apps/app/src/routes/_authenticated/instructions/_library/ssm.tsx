import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { InstructionLibrary } from '@/features/instructions/instruction-library';

export const Route = createFileRoute('/_authenticated/instructions/_library/ssm')({
  staticData: { title: 'SSM' },
  component: OccupationalSafetyLibrary,
});

function OccupationalSafetyLibrary() {
  const { session } = useAuth();
  return <InstructionLibrary domain="ssm" userId={session?.user.id ?? ''} />;
}
