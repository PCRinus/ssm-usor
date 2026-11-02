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
      'Factorii fișei, cu clasele, măsurile și câmpurile planului, și sistemul ei de muncă se copiază într-o evaluare nouă din bibliotecă, pe care o poți aplica la alți clienți. Ce schimbi apoi în fișă sau în bibliotecă nu trece dintr-una în alta.',
    defaultName: evaluationTitle(evaluation),
    submitLabel: 'Salvează în bibliotecă',
    pendingLabel: 'Se salvează…',
    failure: 'Nu am putut salva evaluarea în bibliotecă. Verifică conexiunea și încearcă din nou.',
    submit: async (name) => {
      const { profile } = await save.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: { name },
      });
      // Saving links the evaluation's own factors to the new profile.
      await Promise.all([cache.saved(profile), evaluationCache.refresh(evaluation)]);
      toast.success(`Evaluarea „${profile.name}” a fost salvată în bibliotecă.`, {
        action: {
          label: 'Deschide',
          onClick: () =>
            void navigate({
              to: '/evaluari-de-risc/$profileId',
              params: { profileId: profile.id },
            }),
        },
      });
    },
  });
}
