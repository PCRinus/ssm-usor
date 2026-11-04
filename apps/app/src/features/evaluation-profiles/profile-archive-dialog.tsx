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

import { useUpdateEvaluationProfile } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { profileFailure } from './profile-schema';
import { useProfileCache } from './use-profile-cache';

export interface ProfileArchiveChange {
  profile: { id: string; name: string; inUse: boolean };
  action: 'archive' | 'restore';
}

export function ProfileArchiveDialog({
  change,
  onClose,
}: {
  change: ProfileArchiveChange | null;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const update = useUpdateEvaluationProfile({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending;

  function close() {
    setError(null);
    onClose();
  }

  async function confirm({ profile, action }: ProfileArchiveChange) {
    setError(null);
    try {
      const result = await update.mutateAsync({
        profileId: profile.id,
        data: { archived: action === 'archive' },
      });
      await cache.saved(result.profile);
      toast.success(
        action === 'archive'
          ? `„${profile.name}” a fost arhivată.`
          : `„${profile.name}” a fost reactivată.`
      );
      close();
    } catch (cause) {
      setError(
        profileFailure(
          cause,
          action === 'archive'
            ? 'Nu am putut arhiva evaluarea. Verifică conexiunea și încearcă din nou.'
            : 'Nu am putut reactiva evaluarea. Verifică conexiunea și încearcă din nou.'
        )
      );
      await cache.listChanged();
    }
  }

  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && !busy && close()}>
      {change && (
        <DialogContent data-testid="risk-profile-archive-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {change.action === 'archive' ? 'Arhivezi evaluarea?' : 'Reactivezi evaluarea?'}
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">„{change.profile.name}”</span>
              {change.action === 'archive'
                ? ` iese din lista evaluărilor active: nu mai apare în „Aplică din bibliotecă”, iar la importul unei documentații nu mai e propusă ca evaluare asemănătoare. Pagina și factorii ei rămân${change.profile.inUse ? ', iar fișele clienților care o folosesc nu se schimbă' : ''}. O poți reactiva oricând din lista „Arhivate”.`
                : ' revine în lista evaluărilor active și o poți aplica din nou la fișele clienților.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Notice variant="destructive" data-testid="risk-profile-archive-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={busy} onClick={close}>
              Renunță
            </Button>
            <Button
              data-testid="risk-profile-archive-confirm"
              disabled={busy}
              onClick={() => void confirm(change)}
            >
              {change.action === 'archive'
                ? busy
                  ? 'Se arhivează…'
                  : 'Arhivează'
                : busy
                  ? 'Se reactivează…'
                  : 'Reactivează'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
