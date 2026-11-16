// Two days less an hour: a daily cron fires within minutes of the same time, so two failed
// mornings in a row are always past it and one never is.
export const staleAfterMs = 47 * 60 * 60 * 1000;

export const isStale = (lastStart: string | null, now: number) =>
  lastStart === null || now - Date.parse(lastStart) > staleAfterMs;

export function staleMessage(lastStart: string | null, environment: string) {
  return {
    content: [
      `🔴 **No successful legislation check in two days** · ${environment}`,
      lastStart === null
        ? 'No run has succeeded in this environment yet.'
        : `The last successful run started ${lastStart}.`,
    ].join('\n'),
  };
}
