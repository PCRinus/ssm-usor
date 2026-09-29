import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetInstructionModuleQueryKey,
  getGetInstructionModuleQueryOptions,
} from '../../../api/generated/api';
import { useAuth } from '../../../auth/auth-context';
import { InstructionEditorPage } from '../../../instructions/instruction-editor-page';

export const Route = createFileRoute('/_authenticated/instructions/$moduleId')({
  staticData: { title: 'Instrucțiune', fullPage: true, editorPage: true },
  params: { parse: (params) => ({ moduleId: z.uuid().parse(params.moduleId) }) },
  // A version a document annexed, opened from that document.
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
  component: InstructionModulePage,
});

export function InstructionModulePage() {
  const { moduleId } = Route.useParams();
  const { version } = Route.useSearch();
  const { session } = useAuth();
  return (
    <InstructionEditorPage
      // A different version is a different file to load and show.
      key={version ?? 'current'}
      moduleId={moduleId}
      userId={session?.user.id ?? ''}
      pinnedVersionId={version}
    />
  );
}
