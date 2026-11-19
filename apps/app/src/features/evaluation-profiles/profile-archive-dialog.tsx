import { toast } from '@ssm-usor/ui/lib/toast';
import { useState } from 'react';

import { useUpdateEvaluationProfile } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';

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
  const { request } = useApi();
  const cache = useProfileCache();
  const update = useUpdateEvaluationProfile({ request });
  const [error, setError] = useState<string | null>(null);

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
    change && (
      <ConfirmDialog
        open
        error={error}
        destructive={false}
        testId="risk-profile-archive"
        title={change.action === 'archive' ? 'Arhivezi evaluarea?' : 'Reactivezi evaluarea?'}
        confirmLabel={change.action === 'archive' ? 'Arhivează' : 'Reactivează'}
        pendingLabel={change.action === 'archive' ? 'Se arhivează…' : 'Se reactivează…'}
        onConfirm={() => confirm(change)}
        onClose={close}
      >
        <span className="font-medium text-foreground">„{change.profile.name}”</span>
        {change.action === 'archive'
          ? ` iese din lista evaluărilor active: nu mai apare în „Aplică din bibliotecă”, iar la importul unei documentații nu mai e propusă ca evaluare asemănătoare. Pagina și factorii ei rămân${change.profile.inUse ? ', iar fișele clienților care o folosesc nu se schimbă' : ''}. O poți reactiva oricând din lista „Arhivate”.`
          : ' revine în lista evaluărilor active și o poți aplica din nou la fișele clienților.'}
      </ConfirmDialog>
    )
  );
}
