import { Button } from '@ssm-usor/ui/components/button';
import {
  type ErrorComponentProps,
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router';
import { PenLine, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { getGetEvaluationProfileQueryKey, useGetEvaluationProfile } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { RiskFactorsCard } from '@/features/risk-evaluations/risk-factors-card';
import { RiskResultCard } from '@/features/risk-evaluations/risk-result-card';
import { useFactorFilter } from '@/features/risk-evaluations/use-factor-filter';

import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import type { EvaluationProfile } from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileFactorStore } from './use-profile-cache';

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
  return <ProfileView profile={profile} />;
}

function ProfileView({ profile }: { profile: EvaluationProfile }) {
  const navigate = useNavigate();
  const store = useProfileFactorStore(profile);
  const renaming = useProfileRenaming();
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const [removing, setRemoving] = useState(false);
  const filter = useFactorFilter(profile.factors, 'factors');

  return (
    <div data-testid="risk-profile-page" className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-tight wrap-anywhere">{profile.name}</h2>
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
            <Button
              variant="destructive-outline"
              size="sm"
              data-testid="risk-profile-remove"
              onClick={() => setRemoving(true)}
            >
              <Trash2 aria-hidden="true" />
              Șterge profilul…
            </Button>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ce schimbi aici nu ajunge în evaluările în care ai aplicat deja profilul.
        </p>
      </div>
      <RiskResultCard id="result" evaluation={profile} filter={filter} />
      <RiskFactorsCard
        id="factors"
        factors={profile.factors}
        store={store}
        readOnly={false}
        filter={filter}
        empty="Profilul nu are încă factori de risc."
        removalConsequence="nu vor mai fi în profil. Evaluările în care l-ai aplicat își păstrează copiile."
      />
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <RemoveProfileDialog
        profile={removing ? { ...profile, factorCount: profile.factors.length } : null}
        onClose={() => setRemoving(false)}
        afterRemove={() => navigate({ to: '/risks' })}
      />
    </div>
  );
}

export function EvaluationProfileNotFound() {
  return (
    <div data-testid="risk-profile-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h2 className="text-xl font-semibold tracking-tight">Profilul nu a fost găsit</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun profil cu acest identificator în biblioteca de riscuri, sau a fost șters.
      </p>
      <Button asChild className="w-fit">
        <Link to="/risks">Înapoi la bibliotecă</Link>
      </Button>
    </div>
  );
}

export function EvaluationProfileError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : 'Nu am putut încărca profilul. Încearcă din nou.';
  return (
    <div
      data-testid="risk-profile-error"
      role="alert"
      className="mx-auto grid max-w-lg gap-5 py-14"
    >
      <h2 className="text-xl font-semibold tracking-tight">Profilul nu a putut fi încărcat</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button variant="outline" className="w-fit" onClick={() => void router.invalidate()}>
        Încearcă din nou
      </Button>
    </div>
  );
}
