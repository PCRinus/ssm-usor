import { createFileRoute } from '@tanstack/react-router';

import { InstructionLibrary } from '@/features/instructions/instruction-library';
import { librarySearchSchema } from '@/features/instructions/instruction-schema';

export const Route = createFileRoute('/_authenticated/instructiuni/_library/ssm')({
  staticData: { title: 'IPSSM' },
  validateSearch: librarySearchSchema,
  component: OccupationalSafetyLibrary,
});

function OccupationalSafetyLibrary() {
  return <InstructionLibrary domain="ssm" search={Route.useSearch()} />;
}
