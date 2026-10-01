import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useRemoveEvaluationProfile } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { factorCountLabel } from '@/features/risk-evaluations/risk-evaluation-schema';

import { profileFailure } from './profile-schema';
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
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(
          profileFailure(
            cause,
            'Nu am putut șterge profilul. Verifică conexiunea și încearcă din nou.'
          )
        );
        return;
      }
    }
    toast.success('Profilul a fost șters.');
    await afterRemove?.();
    await cache.removed(target.id);
    close();
  }

  return (
    <Dialog open={profile !== null} onOpenChange={(open) => !open && !remove.isPending && close()}>
      {profile && (
        <DialogContent data-testid="risk-profile-remove-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ștergi profilul?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{profile.name}</span> se șterge din
              bibliotecă
              {profile.factorCount === 1
                ? ', împreună cu factorul său'
                : profile.factorCount > 1
                  ? `, împreună cu cei ${factorCountLabel(profile.factorCount).toLowerCase()} ai săi`
                  : ''}
              . Evaluările în care l-ai aplicat își păstrează factorii copiați.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Notice variant="destructive" data-testid="risk-profile-remove-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={remove.isPending} onClick={close}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              data-testid="risk-profile-remove-confirm"
              disabled={remove.isPending}
              onClick={() => void removeProfile(profile)}
            >
              {remove.isPending ? 'Se șterge…' : 'Șterge profilul'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
