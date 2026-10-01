import { isOverAcceptableLimit } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
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

import { GlobalLevel } from './global-level';
import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import { type EvaluationProfileSummary, profileTotalsLabel } from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileCache } from './use-profile-cache';

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
      description:
        'Un profil este un post evaluat pe care îl refolosești. Îi adaugi factorii de risc după ce îl creezi.',
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
    <div data-testid="risk-library" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-semibold tracking-tight">Biblioteca de riscuri</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Posturile evaluate pe care le refolosești de la un client la altul: factorii de risc cu
            clasele, măsurile de prevenire și câmpurile planului. Aplicat unei evaluări, un profil
            își copiază factorii lângă cei pe care îi are deja; le ajustezi apoi la client.
          </p>
        </div>
        <Button data-testid="risk-profile-new" onClick={startProfile}>
          <Plus aria-hidden="true" />
          Profil nou
        </Button>
      </div>
      <Card>
        <CardContent>
          {profiles.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : profiles.isError ? (
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
          ) : items.length === 0 ? (
            <div data-testid="risk-library-empty" className="grid justify-items-center gap-3 py-10">
              <Library className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Biblioteca este goală</p>
              <p className="max-w-md text-center text-sm text-muted-foreground">
                Un profil se naște dintr-o evaluare făcută deja: deschide evaluarea unui post la un
                client și alege „Salvează ca profil”. Poți și să pornești unul aici, cu „Profil
                nou”, și să-i adaugi factorii pe rând.
              </p>
            </div>
          ) : (
            <ul className="grid divide-y">
              {items.map((profile) => (
                <li
                  key={profile.id}
                  data-testid="risk-profile-row"
                  {...rowClickProps(() => void open(profile.id))}
                  className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md py-3 text-sm hover:bg-muted/50"
                >
                  <div className="grid min-w-0 gap-1">
                    <Link
                      to="/risks/$profileId"
                      params={{ profileId: profile.id }}
                      state={{ openedFromList: true }}
                      data-testid="risk-profile-open"
                      className="font-medium wrap-anywhere hover:underline"
                    >
                      {profile.name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                      <span data-testid="risk-profile-totals">{profileTotalsLabel(profile)}</span>
                      {profile.globalRiskLevel !== null && (
                        <GlobalLevel
                          level={profile.globalRiskLevel}
                          className={cn(
                            isOverAcceptableLimit(profile.globalRiskLevel) &&
                              'text-destructive-foreground'
                          )}
                        />
                      )}
                    </p>
                  </div>
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
                      <DropdownMenuItem
                        data-testid="risk-profile-rename"
                        onSelect={() => setNaming(renaming(profile))}
                      >
                        Redenumește
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="risk-profile-remove"
                        variant="destructive"
                        onSelect={() => setRemoving(profile)}
                      >
                        Șterge
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <RemoveProfileDialog profile={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}
