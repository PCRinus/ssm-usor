import { clip, discordLimits, discordWebhook, noPreview } from '@ssm-usor/discord';

import type { ApiEnv } from './env';

/** 🔴 for what support acts on now, 🟡 for what it looks at this week. */
export type AlertSeverity = 'now' | 'week';

export interface AlertMessage {
  severity: AlertSeverity | 'summary';
  title: string;
  // Each a line of value-free facts: ids, counts, codes. Never a name, a value or a file name.
  lines: string[];
  // Where the admin area shows it, `/imports/<id>`, linked when ADMIN_ORIGIN is set.
  adminPath?: string;
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

export const environmentOf = (env: ApiEnv['Bindings']) => env.ENVIRONMENT?.trim() || 'local';

export function alertText(message: AlertMessage, environment: string, adminOrigin?: string) {
  const link =
    adminOrigin && message.adminPath ? `\n${noPreview(`${adminOrigin}${message.adminPath}`)}` : '';
  const text = [
    `${marks[message.severity]} **${message.title}** · ${environment}`,
    ...message.lines,
  ]
    .join('\n')
    .trim();
  return `${clip(text, discordLimits.content - link.length)}${link}`;
}

export function alertSender(env: ApiEnv['Bindings'], fetcher?: typeof fetch): AlertSender {
  const webhook = discordWebhook(env.DISCORD_ALERTS_WEBHOOK, { fetcher, what: 'An alert' });
  const environment = environmentOf(env);
  const adminOrigin = env.ADMIN_ORIGIN?.trim().replace(/\/+$/, '') || undefined;
  return {
    enabled: webhook.enabled,
    send: (message) => webhook.send({ content: alertText(message, environment, adminOrigin) }),
  };
}
