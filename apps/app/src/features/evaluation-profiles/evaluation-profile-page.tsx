import { Button } from '@ssm-usor/ui/components/button';
import {
  type ErrorComponentProps,
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router';
import { Archive, ArchiveRestore, PenLine, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { getGetEvaluationProfileQueryKey, useGetEvaluationProfile } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { RiskFactorsCard } from '@/features/risk-evaluations/risk-factors-card';
import { RiskResultCard } from '@/features/risk-evaluations/risk-result-card';
import { useFactorListView } from '@/features/risk-evaluations/use-factor-list-view';
import { WorkSystemCard } from '@/features/risk-evaluations/work-system-card';

import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import type { EvaluationProfile } from './profile-schema';
import { ProfileUsageCard } from './profile-usage-card';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileArchiving } from './use-profile-archiving';
import { useProfileFactorStore, useProfileWorkSystemStore } from './use-profile-cache';

export function EvaluationProfilePage({
  profileId,
  userId,
}: {
  profileId: string;
  userId: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const query = useGetEvaluationProfile(profileId, {
    request: apiRequest,
    query: { queryKey: [...getGetEvaluationProfileQueryKey(profileId), userId] },
  });
  const profile = query.data?.profile;
  if (!profile) return query.isError ? <EvaluationProfileNotFound /> : <RiskEvaluationPending />;
  return <ProfileView profile={profile} userId={userId} />;
}

function ProfileView({ profile, userId }: { profile: EvaluationProfile; userId: string }) {
  const navigate = useNavigate();
  const store = useProfileFactorStore(profile);
  const workSystemStore = useProfileWorkSystemStore(profile);
  const renaming = useProfileRenaming();
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const [removing, setRemoving] = useState(false);
  const archiving = useProfileArchiving();
  const [error, setError] = useState<string | null>(null);
  const view = useFactorListView(profile.factors, 'factors');
  const archived = profile.archivedAt !== null;

  const setArchived = async (next: boolean) => {
    setError(null);
    setError(await archiving.setArchived(profile, next));
  };

  return (
    <div data-testid="risk-profile-page" className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{profile.name}</h1>
            <HelpLink
              topic="evaluari-de-risc.pagina-evaluarii"
              label="Ajutor: evaluarea din bibliotecă"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="risk-profile-rename"
              onClick={() => setNaming(renaming(profile))}
            >
              <PenLine aria-hidden="true" />
              Redenumește…
            </Button>
            {archived ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="risk-profile-restore"
                disabled={archiving.isPending}
                onClick={() => void setArchived(false)}
              >
                <ArchiveRestore aria-hidden="true" />
                Reactivează
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                data-testid="risk-profile-archive"
                disabled={archiving.isPending}
                onClick={() => void setArchived(true)}
              >
                <Archive aria-hidden="true" />
                Arhivează
              </Button>
            )}
            {!profile.inUse && (
              <Button
                variant="destructive-outline"
                size="sm"
                data-testid="risk-profile-remove"
                onClick={() => setRemoving(true)}
              >
                <Trash2 aria-hidden="true" />
                Șterge evaluarea…
              </Button>
            )}
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ce schimbi aici nu ajunge în fișele de evaluare în care ai aplicat-o deja.
        </p>
      </div>
      {archived && (
        <Notice variant="info" data-testid="risk-profile-archived">
          Evaluarea este arhivată: nu apare în „Aplică din bibliotecă”. Fișele în care ai aplicat-o
          își păstrează factorii. Reactiveaz-o ca să o poți aplica din nou.
        </Notice>
      )}
      {error && (
        <Notice variant="destructive" data-testid="risk-profile-page-error">
          {error}
        </Notice>
      )}
      <RiskResultCard id="result" evaluation={profile} view={view} />
      <WorkSystemCard
        id="work-system"
        workSystem={{ ...profile, kind: 'library', workTask: null, exposedPersons: null }}
        store={workSystemStore}
        readOnly={false}
      />
      <RiskFactorsCard
        id="factors"
        factors={profile.factors}
        store={store}
        readOnly={false}
        view={view}
        description="Termenele și responsabilii din plan se copiază în fișă ca valori implicite; le schimbi acolo pentru fiecare client."
        empty="Evaluarea nu are încă factori de risc."
        removalConsequence="nu vor mai fi în evaluare. Fișele în care ai aplicat-o își păstrează copiile."
        editorContext={profile.name}
      />
      <ProfileUsageCard profileId={profile.id} inUse={profile.inUse} userId={userId} />
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <RemoveProfileDialog
        profile={removing ? { ...profile, factorCount: profile.factors.length } : null}
        onClose={() => setRemoving(false)}
        afterRemove={() => navigate({ to: '/evaluari-de-risc' })}
      />
    </div>
  );
}

export function EvaluationProfileNotFound() {
  return (
    <div data-testid="risk-profile-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Evaluarea nu a fost găsită</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există nicio evaluare cu acest identificator în bibliotecă, sau a fost ștearsă.
      </p>
      <Button asChild className="w-fit">
        <Link to="/evaluari-de-risc">Înapoi la bibliotecă</Link>
      </Button>
    </div>
  );
}

export function EvaluationProfileError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : 'Nu am putut încărca evaluarea. Încearcă din nou.';
  return (
    <div
      data-testid="risk-profile-error"
      role="alert"
      className="mx-auto grid max-w-lg gap-5 py-14"
    >
      <h1 className="text-2xl font-semibold">Evaluarea nu a putut fi încărcată</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button variant="outline" className="w-fit" onClick={() => void router.invalidate()}>
        Încearcă din nou
      </Button>
    </div>
  );
}
