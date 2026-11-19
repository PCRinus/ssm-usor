import { formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, Pencil, UserCheck } from 'lucide-react';
import { useState } from 'react';

import { getGetServiceContractQueryKey, useGetServiceContract } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener, openedFromRecord, openedHere } from '@/app/opener';
import { BackLink } from '@/components/back-link';
import { useAuth } from '@/features/auth/auth-context';
import { clientFileListSearch } from '@/features/client-files/client-file-list';
import { ClientFilesCard } from '@/features/client-files/client-files-card';
import {
  type ClientArchiveChange,
  ClientArchiveDialog,
} from '@/features/clients/client-archive-dialog';
import { CompanyCard } from '@/features/clients/company-card';
import { ContactCard } from '@/features/clients/contact-card';
import { useOffersInPlan } from '@/features/clients/offers-plan';
import { OffersPlanNotice } from '@/features/clients/offers-plan-notice';
import { OwnerNotesCard } from '@/features/clients/owner-notes-card';
import { PromoteLeadDialog } from '@/features/clients/promote-lead-dialog';
import { HeaderFact, RecordHeader } from '@/features/clients/record-header';
import {
  companyFocus,
  contractFocus,
  focusAmong,
  focusSearch,
  leadFocus,
} from '@/features/missing-data/focus';
import { useEndWayBackOutside } from '@/features/missing-data/way-back';
import { ServiceContractCard } from '@/features/service-contracts/service-contract-card';

export const Route = createFileRoute('/_authenticated/oferte/$leadId/')({
  validateSearch: focusSearch(leadFocus).extend(clientFileListSearch),
  component: LeadPage,
});

const leadRoute = getRouteApi('/_authenticated/oferte/$leadId');

// Only an owner gets here: for anyone else the lead does not exist.
function LeadPage() {
  const { lead } = leadRoute.useLoaderData();
  const { session } = useAuth();
  const search = Route.useSearch();
  const { focus } = search;
  const navigate = Route.useNavigate();
  useEndWayBackOutside(lead.id, session?.user.id);
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [promoting, setPromoting] = useState(false);
  const { request, key } = useApi();
  // The same query the contract card reads, so this costs no request of its own.
  const contract = useGetServiceContract(lead.id, {
    request,
    query: {
      queryKey: key(getGetServiceContractQueryKey(lead.id)),
      enabled: Boolean(session),
    },
  });
  const archived = lead.archivedAt !== null;
  const offers = useOffersInPlan();
  const readOnly = archived || !offers;
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="lead-page" className="space-y-5">
      <RecordHeader
        back={<BackLink to="/oferte" label="Înapoi la oferte" />}
        title={lead.legalName}
        facts={
          <>
            <HeaderFact label="CUI">
              <span className="tabular-nums">{formatCui(lead.cui, lead.vatPayer)}</span>
            </HeaderFact>
            {lead.declaredEmployeeCount !== null && (
              <HeaderFact label="Lucrători declarați">
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
              {offers && (
                <Button asChild variant="secondary" size="sm" data-testid="lead-edit">
                  <Link
                    to="/oferte/$leadId/editare"
                    params={{ leadId: lead.id }}
                    state={openedFromRecord(`/oferte/${lead.id}`)}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="@max-md:sr-only">Modifică</span>
                  </Link>
                </Button>
              )}
              <Button
                variant="secondary"
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
          title="Ofertă arhivată"
          action={
            <Button
              variant="outline"
              size="sm"
              className="border-warning-border bg-card"
              data-testid="lead-restore"
              onClick={() => setArchiveChange({ client: lead, action: 'restore' })}
            >
              <ArchiveRestore aria-hidden="true" />
              Reactivează…
            </Button>
          }
        >
          Datele și notițele ei pot fi citite, dar nu modificate, iar oferta nu poate fi
          transformată în client până nu este reactivată.
        </Notice>
      )}
      {!offers && (
        <OffersPlanNotice>
          Pe planul Start oferta și contractul ei rămân de citit și de descărcat, iar oferta poate
          fi transformată în client oricând. Ca s-o modifici sau să lucrezi la contract, ai nevoie
          de planul Profesional.
        </OffersPlanNotice>
      )}
      <div className="grid gap-6">
        <CompanyCard client={lead} readOnly={readOnly} focus={focusAmong(focus, companyFocus)} />
        <ContactCard client={lead} readOnly={readOnly} />
        <ServiceContractCard
          client={lead}
          userId={session.user.id}
          readOnly={readOnly}
          focus={focusAmong(focus, contractFocus)}
          editor={(children, testId) => (
            <Button asChild variant="secondary" size="sm">
              <Link
                to="/oferte/$leadId/contract"
                params={{ leadId: lead.id }}
                state={openedHere}
                data-testid={testId}
              >
                {children}
              </Link>
            </Button>
          )}
        />
        <ClientFilesCard
          client={lead}
          readOnly={readOnly}
          title="Alte documente"
          search={search}
          onSearch={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, ...next }),
              state: keepOpener,
              replace: true,
              resetScroll: false,
            })
          }
        />
        <OwnerNotesCard clientId={lead.id} readOnly={readOnly} />
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
