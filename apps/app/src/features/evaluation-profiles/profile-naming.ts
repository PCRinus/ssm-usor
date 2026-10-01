import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useRenameEvaluationProfile } from '@/api/generated/api';

import { useProfileCache } from './use-profile-cache';

export interface ProfileNaming {
  title: string;
  description: ReactNode;
  defaultName: string;
  submitLabel: string;
  pendingLabel: string;
  failure: string;
  /** Rejects with the API's error, which the dialog words. */
  submit: (name: string) => Promise<void>;
}

export function useProfileRenaming() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const rename = useRenameEvaluationProfile({ request: apiRequest });
  return (profile: { id: string; name: string }): ProfileNaming => ({
    title: 'Redenumește profilul',
    description: 'Denumirea apare în bibliotecă și când alegi un profil pentru o evaluare.',
    defaultName: profile.name,
    submitLabel: 'Salvează',
    pendingLabel: 'Se salvează…',
    failure: 'Nu am putut redenumi profilul. Verifică conexiunea și încearcă din nou.',
    submit: async (name) => {
      const result = await rename.mutateAsync({ profileId: profile.id, data: { name } });
      await cache.saved(result.profile);
      toast.success('Profilul a fost redenumit.');
    },
  });
}
