import { formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  type ErrorComponentProps,
  getRouteApi,
  Link,
  Outlet,
  useMatches,
  useRouter,
} from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  IdCard,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';

import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { SectionNav } from '@/components/section-nav';
import { useMe } from '@/features/account/use-me';
import { useEndWayBackOutside } from '@/features/missing-data/way-back';

import { type ClientArchiveChange, ClientArchiveDialog } from './client-archive-dialog';
import { HeaderFact, RecordHeader } from './record-header';

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

// The documents follow the data they print. The service contract is an owner's (ADR 007).
const sections = [
  { to: '/clients/$clientId/details', label: 'Detalii', icon: IdCard, ownerOnly: false },
  { to: '/clients/$clientId/employees', label: 'Angajați', icon: UsersRound, ownerOnly: false },
  {
    to: '/clients/$clientId/job-positions',
    label: 'Posturi de lucru',
    icon: BriefcaseBusiness,
    ownerOnly: false,
  },
  {
    to: '/clients/$clientId/training',
    label: 'Instruire și responsabili',
    icon: ClipboardList,
    ownerOnly: false,
  },
  { to: '/clients/$clientId/documents', label: 'Documente SSM', icon: FileText, ownerOnly: false },
  {
    to: '/clients/$clientId/contract',
    label: 'Contract',
    icon: FileSignature,
    ownerOnly: true,
  },
  {
    to: '/clients/$clientId/other-documents',
    label: 'Alte documente',
    icon: FolderOpen,
    ownerOnly: false,
  },
] as const;

export function ClientLayout() {
  const { client } = clientRoute.useLoaderData();
  // Forms such as the new employee page stand on their own; the breadcrumb keeps the context.
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });
  const me = useMe();
  const isOwner = me.data?.membership?.role === 'owner';
  useEndWayBackOutside(client.id, me.data?.user.id);
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  if (fullPage) return <Outlet />;
  return (
    <div data-testid="client-page" className="space-y-5">
      <RecordHeader
        icon={Building2}
        title={client.legalName}
        facts={
          <>
            <HeaderFact label="CUI">
              <span className="tabular-nums">{formatCui(client.cui, client.vatPayer)}</span>
            </HeaderFact>
            <HeaderFact label="Angajați">
              <span className="tabular-nums" data-testid="client-employee-count">
                {client.currentEmployeeCount}
              </span>
            </HeaderFact>
          </>
        }
        actions={
          !client.archivedAt &&
          isOwner && (
            <Button
              variant="outline"
              size="sm"
              data-testid="client-archive"
              onClick={() => setArchiveChange({ client, action: 'archive' })}
            >
              <Archive aria-hidden="true" />
              Arhivează…
            </Button>
          )
        }
      />
      {client.archivedAt && (
        <Notice
          variant="warning"
          data-testid="client-archived-banner"
          title="Client arhivat"
          action={
            isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="border-warning-border bg-card"
                data-testid="client-restore"
                onClick={() => setArchiveChange({ client, action: 'restore' })}
              >
                <ArchiveRestore aria-hidden="true" />
                Restaurează…
              </Button>
            )
          }
        >
          Datele și documentele lui pot fi consultate și descărcate, dar nu modificate.
          {!isOwner && ' Un administrator al organizației îl poate restaura.'}
        </Notice>
      )}
      <SectionNav label="Secțiunile clientului">
        {sections
          .filter((section) => isOwner || !section.ownerOnly)
          .map(({ to, label, icon: Icon }) => (
            <li key={to} className="shrink-0">
              <Link
                to={to}
                params={{ clientId: client.id }}
                resetScroll={false}
                data-testid="client-section"
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
                activeProps={{ 'aria-current': 'page' }}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
      </SectionNav>
      <Outlet />
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
    </div>
  );
}

export function ClientPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function ClientNotFound() {
  return (
    <div data-testid="client-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun client activ cu acest identificator în organizația ta.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients">Înapoi la clienți</Link>
      </Button>
    </div>
  );
}

export function ClientError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : error instanceof ApiHttpError && error.status === 403
        ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
        : 'Nu am putut încărca datele clientului. Încearcă din nou.';
  return (
    <div data-testid="client-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul nu a putut fi încărcat</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        data-testid="client-retry"
        variant="outline"
        className="w-fit"
        onClick={() => void router.invalidate()}
      >
        Încearcă din nou
      </Button>
    </div>
  );
}
