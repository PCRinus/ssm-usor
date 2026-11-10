import { toast } from '@ssm-usor/ui/lib/toast';
import { z } from 'zod';

import { captureEvent } from '@/app/observability/posthog';

import { browserPage } from './reload-page';
import { newVersionText } from './reload-text';

export const versionCheckInterval = 10 * 60_000;
const toastId = 'new-version';
const postponedKey = 'ssm-usor.new-version-postponed';

const versionSchema = z.object({ commit: z.string().min(1) });

export async function fetchDeployedCommit(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const parsed = versionSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.commit : null;
  } catch {
    return null;
  }
}

function postponed() {
  try {
    return localStorage.getItem(postponedKey);
  } catch {
    return null;
  }
}

function postpone(commit: string) {
  try {
    localStorage.setItem(postponedKey, commit);
  } catch {
    // Blocked storage: the toast comes back at the next check.
  }
}

export function startVersionCheck(running: string) {
  if (running === 'local') return () => {};

  let announced: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  async function check() {
    const deployed = await fetchDeployedCommit();
    if (stopped || !deployed || deployed === running) return;
    if (deployed === announced || deployed === postponed()) return;
    announced = deployed;
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
      onDismiss: () => postpone(deployed),
    });
    captureEvent('update_toast_shown', { client: 'app' });
  }

  function schedule() {
    clearInterval(timer);
    timer = undefined;
    if (document.visibilityState !== 'visible') return;
    timer = setInterval(() => void check(), versionCheckInterval);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void check();
    schedule();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  schedule();

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
