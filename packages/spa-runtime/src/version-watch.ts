export const versionCheckInterval = 10 * 60_000;

export async function fetchDeployedCommit(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const { commit } = (await response.json()) as { commit?: unknown };
    return typeof commit === 'string' && commit ? commit : null;
  } catch {
    return null;
  }
}

function readItem(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeItem(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Blocked storage keeps nothing; a later read finds no value, as on a first visit.
  }
}

// `postponedKey` keeps the build a closed toast announced in localStorage, so neither another tab
// nor a reload announces it again (ADR 040).
export function watchDeployedVersion({
  running,
  onNewer,
  postponedKey,
  fetchCommit = () => fetchDeployedCommit(),
  intervalMs = versionCheckInterval,
}: {
  running: string;
  onNewer: (commit: string, postpone: () => void) => void;
  postponedKey: string;
  fetchCommit?: () => Promise<string | null>;
  intervalMs?: number;
}) {
  if (running === 'local') return () => {};

  let announced: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  async function check() {
    const deployed = await fetchCommit();
    if (stopped || !deployed || deployed === running) return;
    if (deployed === announced || deployed === readItem(() => localStorage, postponedKey)) return;
    announced = deployed;
    onNewer(deployed, () => writeItem(() => localStorage, postponedKey, deployed));
  }

  function schedule() {
    clearInterval(timer);
    timer = undefined;
    if (document.visibilityState !== 'visible') return;
    timer = setInterval(() => void check(), intervalMs);
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

export const deployWindow = 60_000;

// A dialog that opens within a minute of the reload it asked for most likely meets the same
// deploy still rolling out, so its button waits for the end of that minute.
export function reloadStamp(key: string) {
  return {
    mark(now = Date.now()) {
      writeItem(() => sessionStorage, key, String(now));
    },
    lockedUntil(now = Date.now()) {
      const stamp = Number(readItem(() => sessionStorage, key));
      if (!Number.isFinite(stamp) || stamp <= 0) return null;
      return now - stamp < deployWindow ? stamp + deployWindow : null;
    },
  };
}
