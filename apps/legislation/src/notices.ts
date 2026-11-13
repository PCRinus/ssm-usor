import {
  codeBlock,
  type DiscordEmbed,
  type DiscordMessage,
  discordWebhook,
} from '@ssm-usor/discord';
import {
  type CheckRun,
  describeOutcome,
  describeRun,
  type LegalAct,
} from '@ssm-usor/legislation-check';

export type NoticeEnv = {
  DISCORD_LEGISLATION_WEBHOOK?: string;
  ENVIRONMENT?: string;
};

export type ChangeNotice = {
  act: Pick<LegalAct, 'id' | 'name' | 'title' | 'portalId'>;
  consolidatedOn: string;
  amendingAct: string | null;
};

const colors = { change: 0x2f6fde } as const;

// Two days less an hour: a daily cron fires within minutes of the same time, so the morning
// after a day without a success is always past it.
export const staleAfterMs = 47 * 60 * 60 * 1000;

export const portalLink = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const environmentOf = (env: NoticeEnv) => env.ENVIRONMENT?.trim() || 'local';

export function changesOf(run: CheckRun): ChangeNotice[] {
  return run.outcomes.flatMap((outcome) =>
    outcome.result === 'checked' && outcome.change?.recorded
      ? [
          {
            act: outcome.act,
            consolidatedOn: outcome.change.consolidatedOn,
            amendingAct: outcome.change.amendingAct,
          },
        ]
      : []
  );
}

export function changeEmbed(change: ChangeNotice): DiscordEmbed {
  return {
    title: change.act.name,
    ...(change.act.portalId !== null && { url: portalLink(change.act.portalId) }),
    ...(change.act.title && { description: change.act.title }),
    color: colors.change,
    fields: [
      { name: 'Consolidated on', value: change.consolidatedOn, inline: true },
      { name: 'Amending act', value: change.amendingAct ?? '—', inline: true },
    ],
  };
}

// One message for all of a run's changes, which Discord gets ten embeds to a post: a post per
// change would hit its rate limit on a morning with many, as the first run in an environment.
export function changesMessage(changes: ChangeNotice[], environment: string): DiscordMessage {
  const heading = changes.length === 1 ? 'New legal change' : `${changes.length} new legal changes`;
  return {
    content: `📜 **${heading}** · ${environment}`,
    embeds: changes.map(changeEmbed),
  };
}

export function failedRunMessage(run: CheckRun, environment: string): DiscordMessage {
  const failed = run.outcomes.filter((outcome) => outcome.result === 'failed');
  return {
    content: [
      `🟡 **Legislation check failed** · ${environment}`,
      describeRun(run, { perAct: false }),
      ...(failed.length > 0 ? [codeBlock(failed.map(describeOutcome).join('\n'))] : []),
    ].join('\n'),
  };
}

export function stoppedRunMessage(reason: string, environment: string): DiscordMessage {
  return {
    content: `🟡 **Legislation check failed** · ${environment}\nThe run stopped: ${reason}`,
  };
}

export function staleMessage(lastStart: string | null, environment: string): DiscordMessage {
  return {
    content: [
      `🔴 **No successful legislation check in two days** · ${environment}`,
      lastStart === null
        ? 'No run has succeeded in this environment yet.'
        : `The last successful run started ${lastStart}.`,
    ].join('\n'),
  };
}

export const isStale = (lastStart: string | null, now: number) =>
  lastStart === null || now - Date.parse(lastStart) > staleAfterMs;

export function legislationNotices(env: NoticeEnv, fetcher?: typeof fetch) {
  const webhook = discordWebhook(env.DISCORD_LEGISLATION_WEBHOOK, {
    fetcher,
    what: 'A legislation notice',
  });
  const environment = environmentOf(env);
  return {
    enabled: webhook.enabled,
    async ran(run: CheckRun) {
      const changes = changesOf(run);
      if (changes.length > 0) await webhook.send(changesMessage(changes, environment));
      if (run.status === 'failed') await webhook.send(failedRunMessage(run, environment));
    },
    async stopped(reason: string) {
      await webhook.send(stoppedRunMessage(reason, environment));
    },
    async stale(lastStart: string | null) {
      await webhook.send(staleMessage(lastStart, environment));
    },
  };
}
