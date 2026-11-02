import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetInstructionModuleQueryKey,
  getGetInstructionModuleQueryOptions,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';
import {
  InstructionModulePage,
  InstructionVersionView,
} from '@/features/instructions/instruction-module-page';

export const Route = createFileRoute('/_authenticated/instructions/$moduleId')({
  staticData: { title: 'Instrucțiune' },
  params: { parse: (params) => ({ moduleId: z.uuid().parse(params.moduleId) }) },
  // A version a document annexed, opened from that document, only to read.
  validateSearch: z.object({ version: z.uuid().optional().catch(undefined) }),
  // The loader warms the module and names the breadcrumb after it.
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    const { module } = await queryClient.ensureQueryData(
      getGetInstructionModuleQueryOptions(params.moduleId, {
        request: apiRequest,
        query: { queryKey: [...getGetInstructionModuleQueryKey(params.moduleId), userId] },
      })
    );
    return { crumb: module.title };
  },
  component: InstructionModuleRoute,
});

function InstructionModuleRoute() {
  const { moduleId } = Route.useParams();
  const { version } = Route.useSearch();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return version ? (
    <InstructionVersionView
      key={version}
      moduleId={moduleId}
      userId={userId}
      pinnedVersionId={version}
    />
  ) : (
    <InstructionModulePage key={moduleId} moduleId={moduleId} userId={userId} />
  );
}
