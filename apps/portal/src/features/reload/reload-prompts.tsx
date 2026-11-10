import { Toaster } from '@ssm-usor/ui/components/sonner';
import { useEffect } from 'react';

import { showNewVersionToast } from './new-version-toast';
import { ReloadDialog } from './reload-dialog';
import { openOutdatedDialog } from './reload-store';
import { watchDeployedVersion } from './version-check';

// The dev server serves no /version.json.
const runningCommit = import.meta.env.DEV ? 'local' : (import.meta.env.VITE_COMMIT_SHA ?? 'local');

export function ReloadPrompts({ running = runningCommit }: { running?: string }) {
  useEffect(() => watchDeployedVersion({ running, onNewer: showNewVersionToast }), [running]);

  useEffect(() => {
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      openOutdatedDialog('code_file');
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);

  return (
    <>
      <Toaster
        position="bottom-right"
        closeButton
        offset={{ bottom: 'var(--portal-toast-bottom)' }}
        mobileOffset={{ bottom: 'var(--portal-toast-bottom)' }}
      />
      <ReloadDialog />
    </>
  );
}
