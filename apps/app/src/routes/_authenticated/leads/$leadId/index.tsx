import { caenClassName, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { Archive, ArchiveRestore, Handshake, Pencil, UserCheck } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  getGetServiceContractQueryKey,
  useGetServiceContract,
} from '../../../../api/generated/api';
import { useAuth } from '../../../../auth/auth-context';
import {
  type ClientArchiveChange,
  ClientArchiveDialog,
} from '../../../../clients/client-archive-dialog';
import { registeredOffice } from '../../../../clients/client-columns';
import { ContactCard } from '../../../../clients/contact-card';
import { OwnerNotesCard } from '../../../../clients/owner-notes-card';
import { Notice } from '../../../../components/notice';
import { PromoteLeadDialog } from '../../../../leads/promote-lead-dialog';
import { ServiceContractCard } from '../../../../service-contracts/service-contract-card';

export const Route = createFileRoute('/_authenticated/leads/$leadId/')({
  component: LeadPage,
});

const leadRoute = getRouteApi('/_authenticated/leads/$leadId');

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

// Only an owner gets here: for anyone else the lead does not exist.
export function LeadPage() {
  const { lead } = leadRoute.useLoaderData();
  const { session } = useAuth();
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
  const office = registeredOffice(lead);
  const caen = lead.caenCode ? caenClassName(lead.caenCode) : null;
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="lead-page" className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Handshake className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{lead.legalName}</h1>
          <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
            <Fact label="CUI">
              <span className="tabular-nums">{formatCui(lead.cui, lead.vatPayer)}</span>
            </Fact>
            {lead.caenCode && (
              <Fact label="CAEN">
                <span className="tabular-nums">{lead.caenCode}</span>
                {caen && <span className="text-muted-foreground"> · {caen}</span>}
              </Fact>
            )}
            {office && <Fact label="Sediu">{office}</Fact>}
            {lead.declaredEmployeeCount !== null && (
              <Fact label="Angajați declarați">
                <span className="tabular-nums">{lead.declaredEmployeeCount}</span>
              </Fact>
            )}
          </dl>
        </div>
        {!archived && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
            <Button asChild variant="outline" size="sm" data-testid="lead-edit">
              <Link to="/leads/$leadId/edit" params={{ leadId: lead.id }}>
                <Pencil aria-hidden="true" />
                Modifică
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="lead-archive"
              onClick={() => setArchiveChange({ client: lead, action: 'archive' })}
            >
              <Archive aria-hidden="true" />
              Arhivează…
            </Button>
            <Button size="sm" data-testid="lead-promote" onClick={() => setPromoting(true)}>
              <UserCheck aria-hidden="true" />
              Transformă în client…
            </Button>
          </div>
        )}
      </header>
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
          Datele și notele lui pot fi citite, dar nu modificate, și nu poate fi transformat în
          client până nu este restaurat.
        </Notice>
      )}
      <div className="grid gap-6">
        <ContactCard client={lead} readOnly={archived} />
        <ServiceContractCard
          client={lead}
          userId={session.user.id}
          readOnly={archived}
          editor={(children, testId) => (
            <Button asChild variant="outline" size="sm">
              <Link to="/leads/$leadId/contract" params={{ leadId: lead.id }} data-testid={testId}>
                {children}
              </Link>
            </Button>
          )}
        />
        <OwnerNotesCard clientId={lead.id} userId={session.user.id} readOnly={archived} />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <PromoteLeadDialog
        lead={promoting ? lead : null}
        signed={contract.data ? Boolean(contract.data.document?.issued?.hasSignedCopy) : undefined}
        onClose={() => setPromoting(false)}
      />
    </div>
  );
}
