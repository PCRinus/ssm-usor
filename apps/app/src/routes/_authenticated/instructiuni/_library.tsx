import { createFileRoute } from '@tanstack/react-router';

import { InstructionLibraryLayout } from '@/features/instructions/instruction-library-layout';

export const Route = createFileRoute('/_authenticated/instructiuni/_library')({
  component: InstructionLibraryLayout,
});
