import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { useBackToList } from '@/app/use-back-to-list';
import { useAuth } from '@/features/auth/auth-context';
import { ServiceContractEditor } from '@/features/service-contracts/service-contract-editor';

export const Route = createFileRoute('/_authenticated/leads/$leadId/contract')({
  staticData: { title: 'Contract', editorPage: true },
  component: LeadContractPage,
});

const leadRoute = getRouteApi('/_authenticated/leads/$leadId');

export function LeadContractPage() {
  const { lead } = leadRoute.useLoaderData();
  const { session } = useAuth();
  const backToList = useBackToList();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <ServiceContractEditor
      clientId={lead.id}
      userId={session.user.id}
      readOnly={lead.archivedAt !== null}
      back={
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/leads/$leadId"
            params={{ leadId: lead.id }}
            data-testid="editor-back"
            onClick={backToList}
            aria-label={`Înapoi la ${lead.legalName}`}
          >
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">{lead.legalName}</span>
          </Link>
        </Button>
      }
    />
  );
}
