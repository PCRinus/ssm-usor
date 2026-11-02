import { isOverAcceptableLimit } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Library, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  getListEvaluationProfilesQueryKey,
  useCreateEvaluationProfile,
  useListEvaluationProfiles,
} from '@/api/generated/api';
import { rowClickProps } from '@/components/data-table/row-click';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { formatGlobalLevel } from '@/features/risk-evaluations/risk-evaluation-schema';
import { dateToIso, formatRoDate } from '@/lib/dates';

import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import {
  clientCountLabel,
  type EvaluationProfileSummary,
  profileCountLabel,
} from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileArchiving } from './use-profile-archiving';
import { useProfileCache } from './use-profile-cache';

const columns = [
  { id: 'name', header: 'Post', className: undefined, skeleton: 'w-48' },
  { id: 'factors', header: 'Factori', className: 'text-right', skeleton: 'ml-auto w-8' },
  { id: 'unacceptable', header: 'Inacceptabili', className: 'text-right', skeleton: 'ml-auto w-8' },
  { id: 'level', header: 'Nivel global', className: 'text-right', skeleton: 'ml-auto w-10' },
  { id: 'clients', header: 'Folosită la', className: 'pl-6', skeleton: 'w-16' },
  { id: 'updated', header: 'Modificat', className: 'pl-6', skeleton: 'w-20' },
] as const;

const skeletonRows = 3;

export function RiskLibrary({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const cache = useProfileCache();
  const [showArchived, setShowArchived] = useState(false);
  const params = { archived: showArchived ? ('true' as const) : ('false' as const) };
  const profiles = useListEvaluationProfiles(params, {
    request: apiRequest,
    query: { queryKey: [...getListEvaluationProfilesQueryKey(params), userId] },
  });
  const create = useCreateEvaluationProfile({ request: apiRequest });
  const renaming = useProfileRenaming();
  const archiving = useProfileArchiving();
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const [removing, setRemoving] = useState<EvaluationProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = profiles.data?.items ?? [];

  const setArchived = async (profile: EvaluationProfileSummary, archived: boolean) => {
    setError(null);
    setError(await archiving.setArchived(profile, archived));
  };

  const open = (profileId: string) =>
    navigate({
      to: '/evaluari-de-risc/$profileId',
      params: { profileId },
      state: { openedFromList: true },
    });

  const startProfile = () =>
    setNaming({
      title: 'Evaluare nouă',
      description: 'Îi adaugi factorii de risc după ce o creezi.',
      defaultName: '',
      submitLabel: 'Creează și deschide',
      pendingLabel: 'Se creează…',
      failure: 'Nu am putut crea evaluarea. Verifică conexiunea și încearcă din nou.',
      submit: async (name) => {
        const { profile } = await create.mutateAsync({ data: { name } });
        await cache.saved(profile);
        toast.success('Evaluarea a fost creată.');
        await open(profile.id);
      },
    });

  return (
    <div data-testid="risk-library" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">Evaluări de risc</h1>
            <HelpLink topic="evaluari-de-risc.biblioteca" label="Ajutor: Evaluări de risc" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Posturile pe care le evaluezi o dată și le aplici la orice client.
          </p>
        </div>
        <Button data-testid="risk-profile-new" onClick={startProfile}>
          <Plus aria-hidden="true" />
          Evaluare nouă
        </Button>
      </div>
      {error && (
        <Notice variant="destructive" data-testid="risk-library-error">
          {error}
        </Notice>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold">
            {showArchived ? 'Evaluări arhivate' : 'Evaluări în uz'}
            {profiles.isPending ? (
              <Skeleton className="h-4 w-16 self-center" />
            ) : (
              profiles.isSuccess && (
                <span
                  className="text-sm font-normal text-muted-foreground"
                  data-testid="risk-library-count"
                >
                  {profileCountLabel(items.length)}
                </span>
              )
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            data-testid="risk-library-toggle-archived"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? 'Arată evaluările în uz' : 'Arată arhiva'}
          </Button>
        </div>
        {profiles.isError ? (
          <div className="p-5">
            <Notice
              variant="destructive"
              action={
                <Button
                  variant="outline"
                  disabled={profiles.isFetching}
                  onClick={() => void profiles.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca biblioteca.
            </Notice>
          </div>
        ) : profiles.isSuccess && items.length === 0 ? (
          <div data-testid="risk-library-empty" className="px-5 py-16 text-center">
            <Library className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-base font-medium">
              {showArchived ? 'Nicio evaluare arhivată' : 'Nicio evaluare încă'}
            </h3>
            {!showArchived && (
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Salvează fișa de evaluare a unui post de la un client cu „Salvează în bibliotecă”
                sau pornește o evaluare goală cu „Evaluare nouă”.
              </p>
            )}
          </div>
        ) : (
          <Table data-testid="risk-library-table" aria-label="Evaluările din bibliotecă">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.id} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
                <TableHead className="w-12">
                  <span className="sr-only">Acțiuni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.isPending
                ? Array.from({ length: skeletonRows }, (_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      {columns.map((column) => (
                        <TableCell key={column.id} className={column.className}>
                          <Skeleton className={cn('h-4', column.skeleton)} />
                        </TableCell>
                      ))}
                      <TableCell />
                    </TableRow>
                  ))
                : items.map((profile) => (
                    <ProfileRow
                      key={profile.id}
                      profile={profile}
                      onOpen={() => void open(profile.id)}
                      onRename={() => setNaming(renaming(profile))}
                      onArchive={(archived) => void setArchived(profile, archived)}
                      onRemove={() => setRemoving(profile)}
                    />
                  ))}
            </TableBody>
          </Table>
        )}
      </div>
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <RemoveProfileDialog profile={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function ProfileRow({
  profile,
  onOpen,
  onRename,
  onArchive,
  onRemove,
}: {
  profile: EvaluationProfileSummary;
  onOpen: () => void;
  onRename: () => void;
  onArchive: (archived: boolean) => void;
  onRemove: () => void;
}) {
  const level = profile.globalRiskLevel;
  return (
    <TableRow data-testid="risk-profile-row" {...rowClickProps(onOpen)}>
      <TableCell className="min-w-48 font-medium whitespace-normal">
        <Link
          to="/evaluari-de-risc/$profileId"
          params={{ profileId: profile.id }}
          state={{ openedFromList: true }}
          data-testid="risk-profile-open"
          className="wrap-anywhere hover:underline"
        >
          {profile.name}
        </Link>
      </TableCell>
      <TableCell className="text-right tabular-nums" data-testid="risk-profile-factors">
        {profile.factorCount}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          profile.unacceptableFactorCount > 0
            ? 'font-medium text-destructive-foreground'
            : 'text-muted-foreground'
        )}
        data-testid="risk-profile-unacceptable"
      >
        {profile.unacceptableFactorCount}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          level === null
            ? 'text-muted-foreground'
            : isOverAcceptableLimit(level) && 'font-medium text-destructive-foreground'
        )}
        data-testid="risk-profile-level"
      >
        {level === null ? '—' : formatGlobalLevel(level)}
      </TableCell>
      <TableCell
        className={cn('pl-6 tabular-nums', profile.clientCount === 0 && 'text-muted-foreground')}
        data-testid="risk-profile-clients"
      >
        {clientCountLabel(profile.clientCount)}
      </TableCell>
      <TableCell className="pl-6 text-muted-foreground tabular-nums">
        {formatRoDate(dateToIso(new Date(profile.updatedAt)))}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="risk-profile-actions"
              aria-label={`Acțiuni pentru ${profile.name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="risk-profile-rename" onSelect={onRename}>
              Redenumește
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {profile.archivedAt ? (
              <DropdownMenuItem
                data-testid="risk-profile-restore"
                onSelect={() => onArchive(false)}
              >
                Reactivează
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem data-testid="risk-profile-archive" onSelect={() => onArchive(true)}>
                Arhivează
              </DropdownMenuItem>
            )}
            {!profile.inUse && (
              <DropdownMenuItem
                data-testid="risk-profile-remove"
                variant="destructive"
                onSelect={onRemove}
              >
                Șterge
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
