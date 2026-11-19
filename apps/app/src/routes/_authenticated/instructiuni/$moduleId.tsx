import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetInstructionModuleQueryKey,
  getGetInstructionModuleQueryOptions,
} from '@/api/generated/api';
import { withUserId } from '@/api/use-api';
import { InstructionEditorPage } from '@/features/instructions/instruction-editor-page';
import { InstructionModulePage } from '@/features/instructions/instruction-module-page';

export const Route = createFileRoute('/_authenticated/instructiuni/$moduleId')({
  staticData: { title: 'Instrucțiune' },
  params: { parse: (params) => ({ moduleId: z.uuid().parse(params.moduleId) }) },
  // A version a document annexed, opened from that document, only to read.
  validateSearch: z.object({ version: z.uuid().optional().catch(undefined) }),
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const key = withUserId(auth.getSnapshot().session?.user.id);
    const { module } = await queryClient.ensureQueryData(
      getGetInstructionModuleQueryOptions(params.moduleId, {
        request: apiRequest,
        query: { queryKey: key(getGetInstructionModuleQueryKey(params.moduleId)) },
      })
    );
    return { crumb: module.title };
  },
  component: InstructionModuleRoute,
});

function InstructionModuleRoute() {
  const { moduleId } = Route.useParams();
  const { version } = Route.useSearch();
  return version ? (
    <InstructionEditorPage key={version} moduleId={moduleId} pinnedVersionId={version} />
  ) : (
    <InstructionModulePage key={moduleId} moduleId={moduleId} />
  );
}
