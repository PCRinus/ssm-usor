import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';

import { useSaveRiskEvaluationAsProfile } from '@/api/generated/api';
import {
  evaluationTitle,
  type RiskEvaluation,
} from '@/features/risk-evaluations/risk-evaluation-schema';
import { useEvaluationCache } from '@/features/risk-evaluations/use-evaluation-cache';

import type { ProfileNaming } from './profile-naming';
import { useProfileCache } from './use-profile-cache';

export function useSaveAsProfile(clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const cache = useProfileCache();
  const evaluationCache = useEvaluationCache(clientId);
  const save = useSaveRiskEvaluationAsProfile({ request: apiRequest });

  return (evaluation: RiskEvaluation): ProfileNaming => ({
    title: 'Salvează în bibliotecă',
    description:
      'Factorii evaluării, cu clasele, măsurile și câmpurile planului, se copiază într-un profil nou al bibliotecii de riscuri, pe care îl poți aplica la alți clienți. Ce schimbi apoi în evaluare sau în profil nu trece dintr-unul în altul.',
    defaultName: evaluationTitle(evaluation),
    submitLabel: 'Salvează în bibliotecă',
    pendingLabel: 'Se salvează…',
    failure: 'Nu am putut salva profilul. Verifică conexiunea și încearcă din nou.',
    submit: async (name) => {
      const { profile } = await save.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: { name },
      });
      // Saving links the evaluation's own factors to the new profile.
      await Promise.all([cache.saved(profile), evaluationCache.refresh(evaluation)]);
      toast.success(`Profilul „${profile.name}” a fost salvat în biblioteca de riscuri.`, {
        action: {
          label: 'Deschide',
          onClick: () =>
            void navigate({ to: '/risks/$profileId', params: { profileId: profile.id } }),
        },
      });
    },
  });
}
