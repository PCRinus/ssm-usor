import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useRemoveEvaluationProfile } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { factorCountLabel } from '@/features/risk-evaluations/risk-evaluation-schema';

import { isProfileInUse, profileFailure } from './profile-schema';
import { useProfileCache } from './use-profile-cache';

interface RemovedProfile {
  id: string;
  name: string;
  factorCount: number;
}

export function RemoveProfileDialog({
  profile,
  onClose,
  afterRemove,
}: {
  profile: RemovedProfile | null;
  onClose: () => void;
  afterRemove?: () => Promise<void>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const remove = useRemoveEvaluationProfile({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function removeProfile(target: RemovedProfile) {
    setError(null);
    try {
      await remove.mutateAsync({ profileId: target.id });
    } catch (cause) {
      if (isProfileInUse(cause)) await cache.refresh(target.id);
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(
          profileFailure(
            cause,
            'Nu am putut șterge evaluarea. Verifică conexiunea și încearcă din nou.'
          )
        );
        return;
      }
    }
    toast.success('Evaluarea a fost ștearsă.');
    await afterRemove?.();
    await cache.removed(target.id);
    close();
  }

  return (
    profile && (
      <ConfirmDialog
        open
        busy={remove.isPending}
        error={error}
        testId="risk-profile-remove"
        title="Ștergi evaluarea?"
        confirmLabel="Șterge evaluarea"
        pendingLabel="Se șterge…"
        onConfirm={() => void removeProfile(profile)}
        onClose={close}
      >
        Evaluarea <span className="font-medium text-foreground">{profile.name}</span> se șterge din
        bibliotecă
        {profile.factorCount === 1
          ? ', împreună cu factorul ei'
          : profile.factorCount > 1
            ? `, împreună cu cei ${factorCountLabel(profile.factorCount).toLowerCase()} ai ei`
            : ''}
        . Nu o folosește niciun client.
      </ConfirmDialog>
    )
  );
}
