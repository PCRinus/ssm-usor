import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { InstructionLibrary } from '@/features/instructions/instruction-library';
import { librarySearchSchema } from '@/features/instructions/instruction-schema';

export const Route = createFileRoute('/_authenticated/instructiuni/_library/su')({
  staticData: { title: 'IPSU' },
  validateSearch: librarySearchSchema,
  component: FireSafetyLibrary,
});

function FireSafetyLibrary() {
  const { session } = useAuth();
  return (
    <InstructionLibrary domain="su" search={Route.useSearch()} userId={session?.user.id ?? ''} />
  );
}
