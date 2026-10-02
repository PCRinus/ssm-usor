import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';

import { useSaveRiskEvaluationAsProfile } from '@/api/generated/api';
import {
  evaluationTitle,
  type RiskEvaluation,
} from '@/features/risk-evaluations/risk-evaluation-schema';

import type { ProfileNaming } from './profile-naming';
import { useProfileCache } from './use-profile-cache';

export function useSaveAsProfile() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const cache = useProfileCache();
  const save = useSaveRiskEvaluationAsProfile({ request: apiRequest });

  return (evaluation: RiskEvaluation): ProfileNaming => ({
    title: 'Salvează ca profil',
    description:
      'Factorii evaluării, cu clasele, măsurile și câmpurile planului, se copiază într-un profil nou al bibliotecii de riscuri, pe care îl poți aplica la alți clienți. Ce schimbi apoi în evaluare sau în profil nu trece dintr-unul în altul.',
    defaultName: evaluationTitle(evaluation),
    submitLabel: 'Salvează profilul',
    pendingLabel: 'Se salvează…',
    failure: 'Nu am putut salva profilul. Verifică conexiunea și încearcă din nou.',
    submit: async (name) => {
      const { profile } = await save.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: { name },
      });
      await cache.saved(profile);
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
