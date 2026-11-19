import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { DocumentsBehind } from '@/features/legislation/documents-behind';

export const Route = createFileRoute('/_authenticated/legislatie/documente-ssm')({
  staticData: { title: 'Documente SSM de actualizat', flushSheet: true },
  component: DocumentsBehindRoute,
});

function DocumentsBehindRoute() {
  const { session } = useAuth();
  return <DocumentsBehind set="occupational_safety" userId={session?.user.id ?? ''} />;
}
