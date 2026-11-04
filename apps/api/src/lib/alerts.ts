import type { ApiEnv } from './env';

/** 🔴 for what support acts on now, 🟡 for what it looks at this week. */
export type AlertSeverity = 'now' | 'week';

export interface AlertMessage {
  severity: AlertSeverity | 'summary';
  title: string;
  // Each a line of value-free facts: ids, counts, codes. Never a name, a value or a file name.
  lines: string[];
}

export interface AlertSender {
  // False without a webhook, so that nothing is read only to be dropped.
  enabled: boolean;
  // Never throws: a post that fails is logged and dropped.
  send(message: AlertMessage): Promise<boolean>;
}

const marks: Record<AlertMessage['severity'], string> = {
  now: '🔴',
  week: '🟡',
  summary: '📋',
};

// Discord refuses a message's content past 2,000 characters.
const maxContent = 2_000;

export const environmentOf = (env: ApiEnv['Bindings']) => env.ENVIRONMENT?.trim() || 'local';

export function alertText(message: AlertMessage, environment: string) {
  const text = [
    `${marks[message.severity]} **${message.title}** · ${environment}`,
    ...message.lines,
  ]
    .join('\n')
    .trim();
  return text.length > maxContent ? `${text.slice(0, maxContent - 1)}…` : text;
}

export function alertSender(
  env: ApiEnv['Bindings'],
  fetcher: typeof fetch = (input, init) => fetch(input, init)
): AlertSender {
  const webhook = env.DISCORD_ALERTS_WEBHOOK?.trim();
  const environment = environmentOf(env);
  return {
    enabled: Boolean(webhook),
    async send(message) {
      if (!webhook) return false;
      try {
        const response = await fetcher(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: alertText(message, environment),
            allowed_mentions: { parse: [] },
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          console.error(`An alert was not posted: Discord answered ${response.status}.`);
          return false;
        }
        return true;
      } catch (error) {
        console.error(
          `An alert was not posted: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}.`
        );
        return false;
      }
    },
  };
}
