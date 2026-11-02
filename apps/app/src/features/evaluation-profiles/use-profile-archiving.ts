import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';

import { useUpdateEvaluationProfile } from '@/api/generated/api';

import { profileFailure } from './profile-schema';
import { useProfileCache } from './use-profile-cache';

/** Resolves with the error to show, or null once the change is saved. */
export function useProfileArchiving() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const update = useUpdateEvaluationProfile({ request: apiRequest });

  const setArchived = async (
    profile: { id: string; name: string },
    archived: boolean
  ): Promise<string | null> => {
    try {
      const result = await update.mutateAsync({ profileId: profile.id, data: { archived } });
      await cache.saved(result.profile);
      toast.success(
        archived ? `„${profile.name}” a fost arhivată.` : `„${profile.name}” a fost reactivată.`
      );
      return null;
    } catch (cause) {
      await cache.listChanged();
      return profileFailure(
        cause,
        'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
      );
    }
  };

  return { setArchived, isPending: update.isPending };
}
