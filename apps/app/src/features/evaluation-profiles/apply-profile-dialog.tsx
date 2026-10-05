import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getListEvaluationProfilesQueryKey,
  useApplyEvaluationProfile,
  useListEvaluationProfiles,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { useSavedToast } from '@/features/missing-data/saved-toast';
import { evaluationFailure } from '@/features/risk-evaluations/evaluation-failure';
import {
  evaluationTitle,
  factorCountLabel,
  type RiskEvaluation,
} from '@/features/risk-evaluations/risk-evaluation-schema';
import { useEvaluationCache } from '@/features/risk-evaluations/use-evaluation-cache';

import { GlobalLevel } from './global-level';
import { profileTotalsLabel } from './profile-schema';

function addedFactorsMessage(added: number, profileName: string) {
  if (added === 0) return `„${profileName}” nu mai are factori; evaluarea a rămas cum era.`;
  return added === 1
    ? `Un factor din „${profileName}” a fost adăugat în evaluare.`
    : `${factorCountLabel(added)} din „${profileName}” au fost adăugați în evaluare.`;
}

export function ApplyProfileDialog({
  evaluation,
  userId,
  open,
  onClose,
}: {
  evaluation: RiskEvaluation;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const cache = useEvaluationCache(evaluation.clientId);
  const profiles = useListEvaluationProfiles({
    request: apiRequest,
    query: { queryKey: [...getListEvaluationProfilesQueryKey(), userId], enabled: open },
  });
  const apply = useApplyEvaluationProfile({ request: apiRequest });
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sources = (profiles.data?.items ?? []).filter((profile) => profile.factorCount > 0);
  const chosen = sources.find((profile) => profile.id === selected);

  function close() {
    setSelected('');
    setError(null);
    onClose();
  }

  async function applyProfile() {
    if (!chosen) return;
    setError(null);
    try {
      const result = await apply.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: { profileId: chosen.id },
      });
      await cache.saved(result.evaluation);
      savedToast(addedFactorsMessage(result.addedFactorCount, chosen.name));
      close();
    } catch (cause) {
      setError(
        evaluationFailure(
          cause,
          'Nu am putut aplica profilul. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !apply.isPending && close()}>
      <DialogContent data-testid="apply-profile-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplică un profil din bibliotecă</DialogTitle>
          <DialogDescription>
            Factorii profilului, cu clasele, măsurile și câmpurile planului, se adaugă după cei pe
            care <span className="font-medium text-foreground">{evaluationTitle(evaluation)}</span>{' '}
            îi are deja. Ajustează apoi clasele la acest client.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && (
            <Notice variant="destructive" data-testid="apply-profile-error">
              {error}
            </Notice>
          )}
          {profiles.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : profiles.isError ? (
            <Notice variant="destructive">Nu am putut încărca biblioteca de riscuri.</Notice>
          ) : sources.length === 0 ? (
            <Notice variant="info" data-testid="apply-profile-none">
              Biblioteca de riscuri nu are încă profiluri cu factori. Salvează în bibliotecă o
              evaluare terminată sau pornește un profil din{' '}
              <Link to="/risks" className="font-medium underline underline-offset-2">
                Riscuri
              </Link>
              .
            </Notice>
          ) : (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Profilul aplicat</legend>
              <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
                {sources.map((profile) => (
                  <li key={profile.id}>
                    <label
                      data-testid="apply-profile-option"
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted/50"
                    >
                      <input
                        type="radio"
                        name="apply-profile"
                        value={profile.id}
                        checked={selected === profile.id}
                        disabled={apply.isPending}
                        onChange={() => setSelected(profile.id)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium wrap-anywhere">{profile.name}</span>
                        <span className="flex flex-wrap gap-x-3 text-muted-foreground">
                          <span>{profileTotalsLabel(profile)}</span>
                          {profile.globalRiskLevel !== null && (
                            <GlobalLevel level={profile.globalRiskLevel} />
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={apply.isPending} onClick={close}>
            Renunță
          </Button>
          <Button
            type="button"
            data-testid="apply-profile-confirm"
            disabled={apply.isPending || !chosen}
            onClick={() => void applyProfile()}
          >
            {apply.isPending ? 'Se aplică…' : 'Aplică profilul'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
