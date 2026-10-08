import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { DocumentsBehind } from '@/features/legislation/documents-behind';

export const Route = createFileRoute('/_authenticated/legislatie/documente')({
  staticData: { title: 'Documente de actualizat' },
  component: DocumentsBehindRoute,
});

function DocumentsBehindRoute() {
  const { session } = useAuth();
  return <DocumentsBehind userId={session?.user.id ?? ''} />;
}
