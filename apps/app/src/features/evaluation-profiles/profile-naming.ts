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
    title: 'Redenumește evaluarea',
    description: 'Denumirea apare în bibliotecă și în lista din „Aplică din bibliotecă”.',
    defaultName: profile.name,
    submitLabel: 'Salvează',
    pendingLabel: 'Se salvează…',
    failure: 'Nu am putut redenumi evaluarea. Verifică conexiunea și încearcă din nou.',
    submit: async (name) => {
      const result = await rename.mutateAsync({ profileId: profile.id, data: { name } });
      await Promise.all([cache.saved(result.profile), cache.linksChanged(profile.id)]);
      toast.success('Evaluarea a fost redenumită.');
    },
  });
}
