import { formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  type ErrorComponentProps,
  getRouteApi,
  Link,
  Outlet,
  useMatches,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  FireExtinguisher,
  Flame,
  FolderOpen,
  IdCard,
  ScanText,
  Smartphone,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';

import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { SectionNav } from '@/components/section-nav';
import { useMe } from '@/features/account/use-me';
import { ImportUploadDialog } from '@/features/imports/import-upload-dialog';
import { useEndWayBackOutside } from '@/features/missing-data/way-back';

import { type ClientArchiveChange, ClientArchiveDialog } from './client-archive-dialog';
import { ClientDeleteDialog, type ClientToDelete } from './client-delete-dialog';
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
  // Documente PSI already shows the extinguisher.
  {
    to: '/clients/$clientId/fire-safety-means',
    label: 'Mijloace PSI',
    icon: Flame,
    ownerOnly: false,
  },
  {
    to: '/clients/$clientId/training',
    label: 'Instruire și responsabili',
    icon: ClipboardList,
    ownerOnly: false,
  },
  {
    to: '/clients/$clientId/trainings',
    label: 'Instruiri ținute',
    icon: ClipboardCheck,
    ownerOnly: false,
  },
  { to: '/clients/$clientId/documents', label: 'Documente SSM', icon: FileText, ownerOnly: false },
  {
    to: '/clients/$clientId/fire-safety-documents',
    label: 'Documente PSI',
    icon: FireExtinguisher,
    ownerOnly: false,
  },
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
  { to: '/clients/$clientId/portal', label: 'Portal', icon: Smartphone, ownerOnly: false },
] as const;

export function ClientLayout() {
  const { client, canDelete } = clientRoute.useLoaderData();
  // Forms such as the new employee page stand on their own; the breadcrumb keeps the context.
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });
  const me = useMe();
  const isOwner = me.data?.membership?.role === 'owner';
  useEndWayBackOutside(client.id, me.data?.user.id);
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [deleting, setDeleting] = useState<ClientToDelete | null>(null);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
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
        actionsWidth="wide"
        actions={
          !client.archivedAt && (
            <>
              <Button
                variant="outline"
                size="sm"
                data-testid="client-import"
                onClick={() => setImporting(true)}
              >
                <ScanText aria-hidden="true" />
                Completează din documentație
              </Button>
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="client-archive"
                  onClick={() => setArchiveChange({ client, action: 'archive' })}
                >
                  <Archive aria-hidden="true" />
                  Arhivează…
                </Button>
              )}
            </>
          )
        }
      />
      {client.archivedAt && (
        <Notice
          variant="warning"
          data-testid="client-archived-banner"
          title="Client arhivat"
          action={
            (isOwner || canDelete) && (
              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-warning-border bg-card"
                    data-testid="client-restore"
                    onClick={() => setArchiveChange({ client, action: 'restore' })}
                  >
                    <ArchiveRestore aria-hidden="true" />
                    Reactivează…
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                    data-testid="client-delete"
                    onClick={() => setDeleting(client)}
                  >
                    <Trash2 aria-hidden="true" />
                    Șterge definitiv…
                  </Button>
                )}
              </div>
            )
          }
        >
          Datele și documentele lui pot fi consultate și descărcate, dar nu modificate.
          {!isOwner && ' Un administrator al organizației îl poate reactiva.'}
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
      <ClientDeleteDialog
        client={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => navigate({ to: '/clients', search: { status: 'archived' } })}
      />
      <ImportUploadDialog
        open={importing}
        client={client}
        onClose={() => setImporting(false)}
        onStarted={(importId) =>
          void navigate({ to: '/clients/import/$importId', params: { importId } })
        }
      />
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
