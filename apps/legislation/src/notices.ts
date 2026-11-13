import {
  codeBlock,
  diffBlock,
  type DiscordEmbed,
  type DiscordMessage,
  discordWebhook,
  type Passage,
} from '@ssm-usor/discord';
import {
  type ActOutcome,
  type ChangeAssessment,
  type ChangePassage,
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
  // The portal's guess from the act's list of actions, for a change not assessed.
  amendingAct: string | null;
  assessment: ChangeAssessment | null;
  // Why a change recorded in this run could not be assessed; the next run tries again.
  notAssessed?: string;
};

const colors = { change: 0x2f6fde, quoteDiffers: 0xe8a317, needsReview: 0xd9534f } as const;

const listed = 10;

function capped(lines: string[], max = listed) {
  return lines.length > max ? [...lines.slice(0, max), `and ${lines.length - max} more`] : lines;
}

// Two days less an hour: a daily cron fires within minutes of the same time, so the morning
// after a day without a success is always past it.
export const staleAfterMs = 47 * 60 * 60 * 1000;

export const portalLink = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const environmentOf = (env: NoticeEnv) => env.ENVIRONMENT?.trim() || 'local';

export function changesOf(run: CheckRun): ChangeNotice[] {
  return run.outcomes.flatMap((outcome: ActOutcome): ChangeNotice[] => {
    if (outcome.result !== 'checked') return [];
    const { assessments } = outcome;
    const notices: ChangeNotice[] = assessments.map((assessment) => ({
      act: outcome.act,
      consolidatedOn: assessment.consolidatedOn,
      amendingAct:
        outcome.change?.consolidatedOn === assessment.consolidatedOn
          ? outcome.change.amendingAct
          : null,
      assessment,
    }));
    const change = outcome.change;
    if (
      change?.recorded &&
      !assessments.some((assessment) => assessment.consolidatedOn === change.consolidatedOn)
    ) {
      notices.push({
        act: outcome.act,
        consolidatedOn: change.consolidatedOn,
        amendingAct: change.amendingAct,
        assessment: null,
        ...(outcome.assessmentError && { notAssessed: outcome.assessmentError.message }),
      });
    }
    return notices;
  });
}

const outcomeLabels = {
  quote_differs: 'Quote differs',
  needs_review: 'Needs review',
} as const;

const unitsOf = (assessment: ChangeAssessment) => [
  ...new Set(assessment.amendedUnits.map((unit) => unit.unit)),
];

function resolvedLine(change: ChangeNotice, assessment: ChangeAssessment, environment: string) {
  const units = unitsOf(assessment);
  const shown = capped(units).join(', ') || 'no unit named';
  const by = assessment.amendingActs.map((act) => act.name).join(', ');
  return `✅ **Resolved, no impact** · ${environment}: ${change.act.name}, form of ${change.consolidatedOn}, ${shown}${by ? ` (${by})` : ''}`;
}

// One post for all of a run's changes with no impact, a line each, for Discord's rate limit.
export function resolvedMessage(changes: ChangeNotice[], environment: string): DiscordMessage {
  return {
    content: changes
      .map((change) => resolvedLine(change, change.assessment!, environment))
      .join('\n'),
  };
}

const embedColor = (change: ChangeNotice) =>
  change.assessment?.outcome === 'quote_differs'
    ? colors.quoteDiffers
    : change.assessment?.outcome === 'needs_review'
      ? colors.needsReview
      : colors.change;

export function changeEmbed(change: ChangeNotice): DiscordEmbed {
  const { assessment } = change;
  const outcome = assessment
    ? outcomeLabels[assessment.outcome as keyof typeof outcomeLabels]
    : change.notAssessed
      ? `Not assessed: ${change.notAssessed} The next run tries again.`
      : 'Not assessed';
  const amendingActs = assessment?.amendingActs.map((act) => act.name).join(', ');
  const units = assessment ? unitsOf(assessment) : [];
  return {
    title: change.act.name,
    ...(change.act.portalId !== null && { url: portalLink(change.act.portalId) }),
    ...(change.act.title && { description: change.act.title }),
    color: embedColor(change),
    fields: [
      { name: 'Consolidated on', value: change.consolidatedOn, inline: true },
      ...(assessment
        ? [
            {
              name: 'Compared with',
              value: assessment.compared
                ? (assessment.comparedWith ?? 'the act as published')
                : '—',
              inline: true,
            },
          ]
        : []),
      { name: 'Outcome', value: outcome, inline: !change.notAssessed },
      {
        name: amendingActs ? 'Amending acts' : 'Amending act',
        value: amendingActs || change.amendingAct || '—',
        inline: true,
      },
      ...(units.length > 0 ? [{ name: 'Amended units', value: capped(units).join('\n') }] : []),
    ],
  };
}

// Past this the unit's whole text would take several posts; its changed words are shown instead.
const wholeUnitChars = 1_200;
const listedHunks = 6;

const joined = (...parts: string[]) => parts.filter((part) => part !== '').join(' ');

function lawPassages(passage: ChangePassage): Passage[] {
  const old = passage.old ?? '';
  const now = passage.new ?? '';
  if (old.length + now.length <= wholeUnitChars || passage.hunks.length === 0) {
    return [{ before: old, after: now }];
  }
  const shown = passage.hunks.slice(0, listedHunks).map((hunk) => ({
    before: joined('…', hunk.before, hunk.old, hunk.after, '…'),
    after: joined('…', hunk.before, hunk.new, hunk.after, '…'),
  }));
  return passage.hunks.length > listedHunks
    ? [...shown, { before: '', after: `and ${passage.hunks.length - listedHunks} more changes` }]
    : shown;
}

function quoteDiffs(assessment: ChangeAssessment) {
  const units = new Map<string, { passage: ChangePassage; places: Set<string> }>();
  for (const passage of assessment.passages) {
    if (passage.form !== 'quote' || passage.status !== 'changed') continue;
    const unit = units.get(passage.unit) ?? { passage, places: new Set<string>() };
    unit.places.add(`${passage.file} (${passage.locator ?? passage.unit})`);
    units.set(passage.unit, unit);
  }
  return [...units].flatMap(([label, unit]) => [
    `**${label}** · ${[...unit.places].join(', ')}`,
    diffBlock(lawPassages(unit.passage)),
  ]);
}

export function changeDetails(change: ChangeNotice): DiscordMessage | null {
  const { assessment } = change;
  if (!assessment || assessment.resolved) return null;
  const details = [
    ...quoteDiffs(assessment),
    ...(assessment.review.length > 0
      ? ['**To review**', ...capped(assessment.review.map((reason) => `- ${reason}`))]
      : []),
  ];
  if (details.length === 0) return null;
  return {
    content: [`**${change.act.name}**, form of ${change.consolidatedOn}`, ...details].join('\n'),
  };
}

// One message for all of a run's changes, which Discord gets ten embeds to a post: a post per
// change would hit its rate limit on a morning with many, as the first run in an environment.
export function changesMessage(changes: ChangeNotice[], environment: string): DiscordMessage {
  const fresh = changes.every((change) => !change.assessment?.backfilled);
  const heading =
    changes.length === 1
      ? fresh
        ? 'New legal change'
        : 'Legal change assessed'
      : `${changes.length} ${fresh ? 'new legal changes' : 'legal changes assessed'}`;
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
      ...(failed.length > 0 ? [codeBlock(capped(failed.map(describeOutcome)).join('\n'))] : []),
    ].join('\n'),
  };
}

// The acts whose changes the run read but could not assess, or left for the next run; a new
// change among them is already in the run's message as not assessed.
export function notAssessedMessage(run: CheckRun, environment: string): DiscordMessage | null {
  const lines = run.outcomes.flatMap((outcome) =>
    outcome.result === 'checked' &&
    ((outcome.assessmentError && !outcome.change?.recorded) || outcome.deferred?.length)
      ? [describeOutcome(outcome)]
      : []
  );
  if (lines.length === 0) return null;
  return {
    content: [
      `🟡 **Legal changes not assessed** · ${environment}`,
      'The next run tries again; a change that fails for three days is left to review.',
      codeBlock(capped(lines).join('\n')),
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
      const open = changes.filter((change) => !change.assessment?.resolved);
      const resolved = changes.filter((change) => change.assessment?.resolved);
      if (open.length > 0) await webhook.send(changesMessage(open, environment));
      for (const change of open) {
        const details = changeDetails(change);
        if (details) await webhook.send(details);
      }
      if (resolved.length > 0) await webhook.send(resolvedMessage(resolved, environment));
      const notAssessed = notAssessedMessage(run, environment);
      if (notAssessed) await webhook.send(notAssessed);
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
