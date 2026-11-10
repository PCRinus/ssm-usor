import { Button } from '@ssm-usor/ui/components/button';
import {
  type ErrorComponentProps,
  Link,
  useNavigate,
  useRouteContext,
} from '@tanstack/react-router';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { getGetEvaluationProfileQueryKey, useGetEvaluationProfile } from '@/api/generated/api';
import { NotFound, RouteError } from '@/app/route-states';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { RiskFactorsCard } from '@/features/risk-evaluations/risk-factors-card';
import { RiskResultCard } from '@/features/risk-evaluations/risk-result-card';
import { useFactorListView } from '@/features/risk-evaluations/use-factor-list-view';
import { WorkSystemCard } from '@/features/risk-evaluations/work-system-card';

import { type ProfileArchiveChange, ProfileArchiveDialog } from './profile-archive-dialog';
import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import type { EvaluationProfile } from './profile-schema';
import { ProfileUsageCard } from './profile-usage-card';
import { RemoveProfileDialog } from './remove-profile-dialog';
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
  const [archiveChange, setArchiveChange] = useState<ProfileArchiveChange | null>(null);
  const view = useFactorListView(profile.factors, 'factors');
  const archived = profile.archivedAt !== null;

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
              <Pencil aria-hidden="true" />
              Redenumește…
            </Button>
            {archived ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="risk-profile-restore"
                onClick={() => setArchiveChange({ profile, action: 'restore' })}
              >
                <ArchiveRestore aria-hidden="true" />
                Reactivează…
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                data-testid="risk-profile-archive"
                onClick={() => setArchiveChange({ profile, action: 'archive' })}
              >
                <Archive aria-hidden="true" />
                Arhivează…
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
                Șterge…
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
        description="Termenele și persoanele care răspund de măsuri, din plan, se copiază în fișă ca valori implicite; le schimbi acolo pentru fiecare client."
        empty="Evaluarea nu are încă factori de risc."
        removalConsequence="nu vor mai fi în evaluare. Fișele în care ai aplicat-o își păstrează copiile."
        editorContext={profile.name}
      />
      <ProfileUsageCard profileId={profile.id} inUse={profile.inUse} userId={userId} />
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <ProfileArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
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
    <NotFound
      testId="risk-profile-not-found"
      title="Evaluarea nu a fost găsită"
      description="Nu există nicio evaluare cu acest identificator în bibliotecă, sau a fost ștearsă."
      action={
        <Button size="lg" asChild>
          <Link to="/evaluari-de-risc">Înapoi la bibliotecă</Link>
        </Button>
      }
    />
  );
}

export function EvaluationProfileError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="risk-profile-error"
      title="Evaluarea nu a putut fi încărcată"
    />
  );
}
