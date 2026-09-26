import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '../../../auth/auth-context';
import { InstructionLibrary } from '../../../instructions/instruction-library';

export const Route = createFileRoute('/_authenticated/instructions/')({
  component: InstructionsPage,
});

export function InstructionsPage() {
  const { session } = useAuth();
  return <InstructionLibrary userId={session?.user.id ?? ''} />;
}
