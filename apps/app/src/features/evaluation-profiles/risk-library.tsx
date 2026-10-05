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
import { Notice } from '@/components/notice';
import { formatGlobalLevel } from '@/features/risk-evaluations/risk-evaluation-schema';
import { dateToIso, formatRoDate } from '@/lib/dates';

import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import { type EvaluationProfileSummary, profileCountLabel } from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileCache } from './use-profile-cache';

const columns = [
  { id: 'name', header: 'Post', className: 'pl-5', skeleton: 'w-48' },
  { id: 'factors', header: 'Factori', className: 'text-right', skeleton: 'ml-auto w-8' },
  { id: 'unacceptable', header: 'Inacceptabili', className: 'text-right', skeleton: 'ml-auto w-8' },
  { id: 'level', header: 'Nivel global', className: 'text-right', skeleton: 'ml-auto w-10' },
  { id: 'updated', header: 'Modificat', className: 'pl-6', skeleton: 'w-20' },
] as const;

const skeletonRows = 3;

export function RiskLibrary({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const cache = useProfileCache();
  const profiles = useListEvaluationProfiles({
    request: apiRequest,
    query: { queryKey: [...getListEvaluationProfilesQueryKey(), userId] },
  });
  const create = useCreateEvaluationProfile({ request: apiRequest });
  const renaming = useProfileRenaming();
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const [removing, setRemoving] = useState<EvaluationProfileSummary | null>(null);
  const items = profiles.data?.items ?? [];

  const open = (profileId: string) =>
    navigate({ to: '/risks/$profileId', params: { profileId }, state: { openedFromList: true } });

  const startProfile = () =>
    setNaming({
      title: 'Profil nou',
      description: 'Îi adaugi factorii de risc după ce îl creezi.',
      defaultName: '',
      submitLabel: 'Creează și deschide',
      pendingLabel: 'Se creează…',
      failure: 'Nu am putut crea profilul. Verifică conexiunea și încearcă din nou.',
      submit: async (name) => {
        const { profile } = await create.mutateAsync({ data: { name } });
        await cache.saved(profile);
        toast.success('Profilul a fost creat.');
        await open(profile.id);
      },
    });

  return (
    <div data-testid="risk-library" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Biblioteca de riscuri</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Posturile pe care le evaluezi o dată și le aplici la orice client.
          </p>
        </div>
        <Button data-testid="risk-profile-new" onClick={startProfile}>
          <Plus aria-hidden="true" />
          Profil nou
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
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
            <h3 className="text-base font-medium">Niciun profil încă</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Salvează evaluarea unui post de la un client cu „Salvează în bibliotecă” sau pornește
              un profil gol cu „Profil nou”.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end border-b px-5 py-3">
              {profiles.isPending ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <span className="text-sm text-muted-foreground" data-testid="risk-library-count">
                  {profileCountLabel(items.length)}
                </span>
              )}
            </div>
            <Table data-testid="risk-library-table" aria-label="Profilurile din bibliotecă">
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.id} className={column.className}>
                      {column.header}
                    </TableHead>
                  ))}
                  <TableHead className="w-12 pr-3">
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
                        onRemove={() => setRemoving(profile)}
                      />
                    ))}
              </TableBody>
            </Table>
          </>
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
  onRemove,
}: {
  profile: EvaluationProfileSummary;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const level = profile.globalRiskLevel;
  return (
    <TableRow data-testid="risk-profile-row" {...rowClickProps(onOpen)}>
      <TableCell className="min-w-48 pl-5 font-medium whitespace-normal">
        <Link
          to="/risks/$profileId"
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
      <TableCell className="pl-6 text-muted-foreground tabular-nums">
        {formatRoDate(dateToIso(new Date(profile.updatedAt)))}
      </TableCell>
      <TableCell className="pr-3 text-right">
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
            <DropdownMenuItem
              data-testid="risk-profile-remove"
              variant="destructive"
              onSelect={onRemove}
            >
              Șterge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
