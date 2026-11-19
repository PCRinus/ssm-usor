import { watchDeployedVersion } from '@ssm-usor/spa-runtime/version-watch';
import { toast } from '@ssm-usor/ui/lib/toast';

import { captureEvent } from '@/app/observability/posthog';

import { browserPage } from './reload-page';
import { newVersionText } from './reload-text';

export { versionCheckInterval } from '@ssm-usor/spa-runtime/version-watch';

const toastId = 'new-version';
const postponedKey = 'ssm-usor.new-version-postponed';

export function startVersionCheck(running: string) {
  return watchDeployedVersion({
    running,
    postponedKey,
    onNewer: (_commit, postpone) => {
      toast.info(newVersionText.title, {
        id: toastId,
        description: newVersionText.description,
        duration: Infinity,
        action: {
          label: newVersionText.action,
          onClick: () => {
            captureEvent('reload_clicked', { prompt: 'toast' });
            browserPage.reload();
          },
        },
        onDismiss: postpone,
      });
      captureEvent('update_toast_shown', { client: 'app' });
    },
  });
}
