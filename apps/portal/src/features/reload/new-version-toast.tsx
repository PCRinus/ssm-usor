import { Trans } from '@lingui/react/macro';
import { toast } from '@ssm-usor/ui/lib/toast';

import { captureEvent } from '@/app/observability/posthog';

import { isOutdatedDialogOpen, reloadPortal } from './reload-store';

const newVersionToastId = 'portal-new-version';

export function showNewVersionToast() {
  if (isOutdatedDialogOpen()) return;
  captureEvent('update_toast_shown', { client: 'portal' });
  toast.info(<Trans>A apărut o versiune nouă a portalului.</Trans>, {
    id: newVersionToastId,
    duration: Infinity,
    description: <Trans>Reîncarcă pagina pentru a o folosi.</Trans>,
    action: { label: <Trans>Reîncarcă</Trans>, onClick: () => reloadPortal('toast') },
  });
}

export const dismissNewVersionToast = () => toast.dismiss(newVersionToastId);
