import { toast } from '@ssm-usor/ui/lib/toast';
import { useEffect } from 'react';

import { commitSha } from '@/app/build-version';
import { captureEvent } from '@/app/observability/posthog';

import { restoreTypedText, trackTypedText } from './kept-text';
import { startVersionCheck } from './new-version-toast';
import { ReloadDialog } from './reload-dialog';
import { openReloadDialog, setReloadPage } from './reload-dialog-store';
import { restoredText } from './reload-text';

export interface ReloadPromptsProps {
  page: () => string;
  subscribeToPage: (listener: () => void) => () => void;
  runningCommit?: string;
  checkVersion?: boolean;
}

export function ReloadPrompts({
  page,
  subscribeToPage,
  runningCommit = commitSha,
  checkVersion = import.meta.env.PROD,
}: ReloadPromptsProps) {
  useEffect(() => {
    setReloadPage(page);
    return trackTypedText();
  }, [page]);

  useEffect(() => {
    // Uncancelled, Vite rethrows the failed import and TanStack Router reloads the page by
    // itself once; the dialog leaves the reload to the person (ADR 040).
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      openReloadDialog('code_file');
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);

  useEffect(() => {
    if (!checkVersion) return;
    return startVersionCheck(runningCommit);
  }, [checkVersion, runningCommit]);

  useEffect(() => {
    const callbacks = {
      onFirstRestore: () => toast.success(restoredText),
      onRestored: (count: number) => captureEvent('typed_text_restored', { client: 'app', count }),
    };
    let shown = page();
    let stop = restoreTypedText({ page, ...callbacks });
    const unsubscribe = subscribeToPage(() => {
      if (page() === shown) return;
      shown = page();
      stop();
      stop = restoreTypedText({ page, ...callbacks });
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [page, subscribeToPage]);

  return <ReloadDialog />;
}
