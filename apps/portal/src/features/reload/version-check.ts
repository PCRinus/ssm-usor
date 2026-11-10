export const versionCheckIntervalMs = 10 * 60 * 1000;

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

export function watchDeployedVersion({
  running,
  fetchCommit = () => fetchDeployedCommit(),
  onNewer,
  intervalMs = versionCheckIntervalMs,
}: {
  running: string;
  fetchCommit?: () => Promise<string | null>;
  onNewer: (commit: string) => void;
  intervalMs?: number;
}) {
  if (running === 'local') return () => {};

  // Closing the toast postpones it until a build newer than the one it announced.
  let announced: string | null = null;
  let stopped = false;

  async function check() {
    if (document.visibilityState !== 'visible') return;
    const deployed = await fetchCommit();
    if (stopped || !deployed || deployed === running || deployed === announced) return;
    announced = deployed;
    onNewer(deployed);
  }

  const onVisibility = () => void check();
  document.addEventListener('visibilitychange', onVisibility);
  const timer = setInterval(() => void check(), intervalMs);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(timer);
  };
}
