import {
  categoryFitsDomain,
  instructionDomainSchema,
  instructionModuleGroupSchema,
} from '@ssm-usor/contracts';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { NewInstructionPage } from '@/features/instructions/instruction-module-page';
import { moduleFormSchema } from '@/features/instructions/instruction-schema';

const searchSchema = z.object({
  title: moduleFormSchema.shape.title,
  domain: instructionDomainSchema,
  group: instructionModuleGroupSchema,
  from: z.uuid().optional(),
});

// Nothing is stored until the form's first save; "Scrie o instrucțiune" names the module here.
export const Route = createFileRoute('/_authenticated/instructions/new')({
  staticData: { title: 'Instrucțiune nouă' },
  validateSearch: (search) => {
    const parsed = searchSchema.safeParse(search);
    return parsed.success && categoryFitsDomain(parsed.data.group, parsed.data.domain)
      ? parsed.data
      : { invalid: true as const };
  },
  beforeLoad: ({ search }) => {
    if ('invalid' in search) throw redirect({ to: '/instructions/ssm', replace: true });
  },
  component: NewInstructionRoute,
});

function NewInstructionRoute() {
  const start = Route.useSearch();
  const { session } = useAuth();
  if ('invalid' in start) return null;
  return <NewInstructionPage start={start} userId={session?.user.id ?? ''} />;
}
