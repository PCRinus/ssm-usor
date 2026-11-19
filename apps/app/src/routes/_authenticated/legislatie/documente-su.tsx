import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { DocumentsBehind } from '@/features/legislation/documents-behind';

export const Route = createFileRoute('/_authenticated/legislatie/documente-su')({
  staticData: { title: 'Documente SU de actualizat', flushSheet: true },
  component: DocumentsBehindRoute,
});

function DocumentsBehindRoute() {
  const { session } = useAuth();
  return <DocumentsBehind set="fire_safety" userId={session?.user.id ?? ''} />;
}
