import { formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { Archive, ArchiveRestore, Handshake, Pencil, UserCheck } from 'lucide-react';
import { useState } from 'react';

import { getGetServiceContractQueryKey, useGetServiceContract } from '@/api/generated/api';
import { useAuth } from '@/auth/auth-context';
import { ClientFilesCard } from '@/client-files/client-files-card';
import { type ClientArchiveChange, ClientArchiveDialog } from '@/clients/client-archive-dialog';
import { CompanyCard } from '@/clients/company-card';
import { ContactCard } from '@/clients/contact-card';
import { OwnerNotesCard } from '@/clients/owner-notes-card';
import { HeaderFact, RecordHeader } from '@/clients/record-header';
import { Notice } from '@/components/notice';
import { PromoteLeadDialog } from '@/leads/promote-lead-dialog';
import {
  companyFocus,
  contractFocus,
  focusAmong,
  focusSearch,
  leadFocus,
} from '@/missing-data/focus';
import { useEndWayBackOutside } from '@/missing-data/way-back';
import { ServiceContractCard } from '@/service-contracts/service-contract-card';

export const Route = createFileRoute('/_authenticated/leads/$leadId/')({
  validateSearch: focusSearch(leadFocus),
  component: LeadPage,
});

const leadRoute = getRouteApi('/_authenticated/leads/$leadId');

// Only an owner gets here: for anyone else the lead does not exist.
export function LeadPage() {
  const { lead } = leadRoute.useLoaderData();
  const { session } = useAuth();
  const { focus } = Route.useSearch();
  useEndWayBackOutside(lead.id, session?.user.id);
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [promoting, setPromoting] = useState(false);
  const { apiRequest } = useRouteContext({ from: '__root__' });
  // The same query the contract card reads, so this costs no request of its own.
  const contract = useGetServiceContract(lead.id, {
    request: apiRequest,
    query: {
      queryKey: [...getGetServiceContractQueryKey(lead.id), session?.user.id],
      enabled: Boolean(session),
    },
  });
  const archived = lead.archivedAt !== null;
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="lead-page" className="space-y-5">
      <RecordHeader
        icon={Handshake}
        title={lead.legalName}
        facts={
          <>
            <HeaderFact label="CUI">
              <span className="tabular-nums">{formatCui(lead.cui, lead.vatPayer)}</span>
            </HeaderFact>
            {lead.declaredEmployeeCount !== null && (
              <HeaderFact label="Angajați declarați">
                <span className="tabular-nums" data-testid="lead-declared-employees">
                  {lead.declaredEmployeeCount}
                </span>
              </HeaderFact>
            )}
          </>
        }
        actionsWidth="wide"
        actions={
          !archived && (
            <>
              <Button asChild variant="outline" size="sm" data-testid="lead-edit">
                <Link to="/leads/$leadId/edit" params={{ leadId: lead.id }}>
                  <Pencil aria-hidden="true" />
                  <span className="@max-md:sr-only">Modifică</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="lead-archive"
                onClick={() => setArchiveChange({ client: lead, action: 'archive' })}
              >
                <Archive aria-hidden="true" />
                <span className="@max-md:sr-only">Arhivează…</span>
              </Button>
              <Button size="sm" data-testid="lead-promote" onClick={() => setPromoting(true)}>
                <UserCheck aria-hidden="true" />
                Transformă în client…
              </Button>
            </>
          )
        }
      />
      {archived && (
        <Notice
          variant="warning"
          data-testid="lead-archived-banner"
          title="Client potențial arhivat"
          action={
            <Button
              variant="outline"
              size="sm"
              className="border-warning-border bg-card"
              data-testid="lead-restore"
              onClick={() => setArchiveChange({ client: lead, action: 'restore' })}
            >
              <ArchiveRestore aria-hidden="true" />
              Restaurează…
            </Button>
          }
        >
          Datele și notițele lui pot fi citite, dar nu modificate, și nu poate fi transformat în
          client până nu este restaurat.
        </Notice>
      )}
      <div className="grid gap-6">
        <CompanyCard client={lead} readOnly={archived} focus={focusAmong(focus, companyFocus)} />
        <ContactCard client={lead} readOnly={archived} />
        <ServiceContractCard
          client={lead}
          userId={session.user.id}
          readOnly={archived}
          focus={focusAmong(focus, contractFocus)}
          editor={(children, testId) => (
            <Button asChild variant="outline" size="sm">
              <Link
                to="/leads/$leadId/contract"
                params={{ leadId: lead.id }}
                state={{ openedFromList: true }}
                data-testid={testId}
              >
                {children}
              </Link>
            </Button>
          )}
        />
        <ClientFilesCard client={lead} userId={session.user.id} readOnly={archived} />
        <OwnerNotesCard clientId={lead.id} userId={session.user.id} readOnly={archived} />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <PromoteLeadDialog
        lead={promoting ? lead : null}
        signed={contract.data ? Boolean(contract.data.document?.issued?.hasSignedCopy) : undefined}
        received={Boolean(contract.data?.document?.issued?.receivedCopy)}
        onClose={() => setPromoting(false)}
      />
    </div>
  );
}
