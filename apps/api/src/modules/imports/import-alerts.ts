import type { ImportKind, ImportLibraryPart } from '@ssm-usor/contracts';

import type { AlertMessage, AlertSender, AlertSeverity } from '../../lib/alerts';
import type { ImportQueue } from '../../lib/env';
import { libraryReasons, riskReasons } from './library';
import { describe, importReasons } from './pipeline';
import { changedShare, type FilePlace, type ReadingFlags } from './reading-flags';
import type { DayPartRow, ImportDay, ImportRecords } from './records';

export const mostlyChangedShare = 0.5;
export const expensiveImportUsd = 1;
export const busyImportsPerHour = 10;
export const busySpendPerDayUsd = 5;
export const reportAlertMinutes = 10;

export const alertRules = {
  failed: { title: 'Failed on our side', severity: 'now' },
  stuck: { title: 'Stuck', severity: 'now' },
  nothing_found: { title: 'Sorted, but nothing found', severity: 'week' },
  no_required_field: { title: 'Client reading with no required field', severity: 'week' },
  unreadable_files: { title: 'Files we could not open', severity: 'week' },
  reported: { title: 'Reported by the member', severity: 'now' },
  mostly_changed: { title: 'Confirmed, but mostly changed', severity: 'week' },
  abandoned_after_reading: { title: 'Abandoned after a reading', severity: 'week' },
  expensive: { title: 'Expensive import', severity: 'week' },
  busy_organization: { title: 'Busy organization', severity: 'now' },
} as const satisfies Record<string, { title: string; severity: AlertSeverity }>;

export type AlertRule = keyof typeof alertRules;

export interface ImportAlert {
  rule: AlertRule;
  importId: string;
  organizationId: string;
  kind: ImportKind;
  part: ImportLibraryPart | null;
  // The import with its parts, in USD.
  costUsd: number | null;
  facts: string[];
}

/**
 * When a rule is checked: `read` as a reading ends, `ended` as an import or a part ends,
 * `cleanUp` as the daily clean-up fails it, `expired` as a part's 14 days run out.
 */
export type Moment = 'read' | 'ended' | 'cleanUp' | 'expired';

export interface AlertDeps {
  records: ImportRecords;
  alerts: AlertSender;
}

// A failure reason is Romanian text that may name a file or a company, so a message carries the
// code of the reason instead.
let reasonCodes: Map<string, string> | null = null;

function codesOf(prefix: string, reasons: Record<string, unknown>) {
  return Object.entries(reasons).flatMap(([key, value]): [string, string][] => {
    if (typeof value === 'string') return [[value, `${prefix}.${key}`]];
    if (value && typeof value === 'object') {
      return Object.values(value).map((text) => [String(text), `${prefix}.${key}`]);
    }
    return [];
  });
}

export function failureCode(reason: string | null) {
  if (!reason) return null;
  reasonCodes ??= new Map([
    ...codesOf('import', importReasons),
    ...codesOf('instructions', libraryReasons),
    ...codesOf('risks', riskReasons),
  ]);
  const known = reasonCodes.get(reason);
  if (known) return known;
  if (reason.startsWith('Documentele au cu')) return 'import.tooMuchText';
  if (reason.startsWith('Instrucțiunile proprii și tematicile au')) return 'instructions.tooLarge';
  if (reason.startsWith('Evaluarea riscurilor și planul de prevenire au')) return 'risks.tooLarge';
  return 'other';
}

// The gateway or the model did not answer or gave nothing usable, the scans did not finish, an
// error, or the deployment lacks a setting: not the member's files.
const ourReasons = new Set([
  'unavailable',
  'notConfigured',
  'modelRefused',
  'modelFailed',
  'failed',
  'scansUnfinished',
]);

const isOurs = (reason: string | null) => {
  const code = failureCode(reason);
  return code !== null && ourReasons.has(code.split('.')[1]!);
};

function flagsOf(value: unknown): ReadingFlags | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const flags = value as Partial<ReadingFlags>;
  return { ...flags, found: flags.found ?? {}, checks: flags.checks ?? {} };
}

const usd = (value: number) => `$${value.toFixed(2)}`;

const describePlaces = (places: FilePlace[], total: number | undefined) =>
  places.map((place) => `file ${place.file}${total ? ` of ${total}` : ''}, ${place.kind}`);

const timeOf = (at: string | null) => (at ? Date.parse(at) : null);

// An import record as the alerts read it: the day summary's has no files.
type Checked = ImportDay & { files?: readonly unknown[] };

function alertOf(
  record: Checked,
  part: DayPartRow | null,
  rule: AlertRule,
  facts: string[]
): ImportAlert {
  return {
    rule,
    importId: record.row.id,
    organizationId: record.row.organization_id,
    kind: record.row.kind,
    part: part?.part ?? null,
    costUsd: record.row.cost_usd === null ? null : Number(record.row.cost_usd),
    facts,
  };
}

function readingRules(
  record: Checked,
  part: DayPartRow | null,
  flags: ReadingFlags | null
): ImportAlert[] {
  const alerts: ImportAlert[] = [];
  const total = flags?.files?.total ?? record.files?.length ?? 0;
  if (flags?.nothingFound?.length) {
    alerts.push(
      alertOf(record, part, 'nothing_found', describePlaces(flags.nothingFound, total || undefined))
    );
  }
  if (!part && record.row.kind === 'client' && flags?.emptyRequired?.length === 3) {
    alerts.push(
      alertOf(record, part, 'no_required_field', [
        'No company name, no CUI and no post proposed',
        `Files: ${total}, by kind: ${
          Object.entries(flags.files?.byKind ?? {})
            .map(([kind, count]) => `${kind} ${count}`)
            .join(', ') || 'none'
        }`,
      ])
    );
  }
  if (!part && flags?.files?.unreadable.length) {
    alerts.push(
      alertOf(record, part, 'unreadable_files', describePlaces(flags.files.unreadable, total))
    );
  }
  return alerts;
}

// Checked as each reading ends, the import's and each part's; sent only by the caller that marks
// it sent on the import, so a part read again, or two parts ending together, alert once.
export function expensiveAlert(record: Checked, part: DayPartRow | null): ImportAlert | null {
  const cost = Number(record.row.cost_usd ?? 0);
  if (cost <= expensiveImportUsd || record.row.expensive_alerted_at) return null;
  return alertOf(record, part, 'expensive', [
    `The import with its parts cost ${usd(cost)}, over ${usd(expensiveImportUsd)}`,
  ]);
}

function endRules(record: Checked, part: DayPartRow | null): ImportAlert[] {
  const own = part ?? record.row;
  const alerts: ImportAlert[] = [];
  if (own.status === 'failed' && isOurs(own.failure_reason)) {
    alerts.push(alertOf(record, part, 'failed', [`Reason: ${failureCode(own.failure_reason)}`]));
  }
  if (own.status === 'confirmed') {
    const flags = flagsOf(own.reading_flags);
    const changed = changedShare(own.quality, flags?.proposedValues);
    if (changed && changed.share > mostlyChangedShare) {
      alerts.push(
        alertOf(record, part, 'mostly_changed', [
          `Changed or unticked ${changed.changed} of ${changed.whole} proposed (${Math.round(changed.share * 100)}%)`,
        ])
      );
    }
  }
  const { row } = record;
  if (!part && row.status === 'abandoned' && row.ready_at && !row.failed_at) {
    alerts.push(
      alertOf(record, part, 'abandoned_after_reading', [
        `Abandoned by the member, read at ${row.ready_at}`,
      ])
    );
  }
  return alerts;
}

function cleanUpRules(record: Checked, part: DayPartRow | null): ImportAlert[] {
  const own = part ?? record.row;
  if (own.status !== 'failed') return [];
  const code = failureCode(own.failure_reason);
  if (code?.endsWith('.stalled')) return [alertOf(record, part, 'stuck', [`Reason: ${code}`])];
  if (!part && code === 'import.left' && record.row.ready_at) {
    return [
      alertOf(record, part, 'abandoned_after_reading', [
        `Left unconfirmed 14 days and failed by the clean-up, read at ${record.row.ready_at}`,
      ]),
    ];
  }
  return [];
}

export function alertsOf(
  record: Checked,
  part: ImportLibraryPart | null,
  moment: Moment
): ImportAlert[] {
  const partRow = part ? record.parts.find((each) => each.part === part) : null;
  if (part && !partRow) return [];
  const own = partRow ?? null;
  switch (moment) {
    case 'read':
      return readingRules(record, own, flagsOf((own ?? record.row).reading_flags));
    case 'ended':
      return endRules(record, own);
    case 'cleanUp':
      return cleanUpRules(record, own);
    case 'expired':
      return own?.status === 'to_review' && record.row.status === 'confirmed'
        ? [
            alertOf(record, own, 'abandoned_after_reading', [
              `Left to review until it expired, read at ${own.read_at}`,
            ]),
          ]
        : [];
  }
}

export function messageOf(alert: ImportAlert): AlertMessage {
  const { title, severity } = alertRules[alert.rule];
  return {
    severity,
    title,
    lines: [
      `Import: ${alert.kind} ${alert.importId}${alert.part ? `, part ${alert.part}` : ''}`,
      `Organization: ${alert.organizationId}`,
      ...alert.facts,
      ...(alert.costUsd === null ? [] : [`Cost: ${usd(alert.costUsd)}`]),
    ],
  };
}

async function sendAll(deps: Pick<AlertDeps, 'alerts'>, alerts: ImportAlert[]) {
  for (const alert of alerts) await deps.alerts.send(messageOf(alert));
}

/** Never throws: an alert lost is logged, and never holds up the import. */
export async function alertImport(
  deps: AlertDeps,
  importId: string,
  part: ImportLibraryPart | null,
  moments: Moment[]
) {
  if (!deps.alerts.enabled) return;
  try {
    const record = await deps.records.get(importId);
    if (!record) return;
    const alerts = moments.flatMap((moment) => alertsOf(record, part, moment));
    const partRow = part ? (record.parts.find((each) => each.part === part) ?? null) : null;
    const expensive = moments.includes('read') ? expensiveAlert(record, partRow) : null;
    if (expensive && (await deps.records.claimExpensiveAlert(importId))) alerts.push(expensive);
    await sendAll(deps, alerts);
  } catch (error) {
    console.error(`The alerts of import ${importId} were not checked: ${describe(error)}`);
  }
}

/**
 * The end of an import or a part: its alerts, then its improvement copy, written by a message of
 * its own so that a copy retried does not send them again. A copy not queued is written by the
 * daily clean-up.
 */
export async function importEnded(
  deps: AlertDeps & { queue: ImportQueue | null },
  importId: string,
  part: ImportLibraryPart | null,
  moments: Moment[] = ['ended']
) {
  await alertImport(deps, importId, part, moments);
  try {
    if (!deps.queue) throw new Error('no import queue');
    await deps.queue.send({ type: 'keep', importId, ...(part ? { part } : {}) });
  } catch (error) {
    console.error(
      `The copy of import ${importId}${part ? ` part ${part}` : ''} was not queued: ${describe(error)}`
    );
  }
}

// Best effort, per isolate: the spend since midnight stays over its line for every later start.
const busyAlertedAt = new Map<string, number>();
const busyQuietMilliseconds = 60 * 60 * 1000;

export async function alertBusyOrganization(
  deps: AlertDeps,
  started: { importId: string; organizationId: string; kind: ImportKind },
  now = new Date()
) {
  if (!deps.alerts.enabled) return;
  try {
    const last = busyAlertedAt.get(started.organizationId);
    if (last !== undefined && now.getTime() - last < busyQuietMilliseconds) return;
    const activity = await deps.records.activity(started.organizationId, now);
    const facts = [
      ...(activity.startedLastHour > busyImportsPerHour
        ? [
            `${activity.startedLastHour} imports started in the last hour, over ${busyImportsPerHour}`,
          ]
        : []),
      ...(activity.spentTodayUsd > busySpendPerDayUsd
        ? [
            `${usd(activity.spentTodayUsd)} spent on imports started since midnight UTC, over ${usd(busySpendPerDayUsd)}`,
          ]
        : []),
    ];
    if (facts.length === 0) return;
    busyAlertedAt.set(started.organizationId, now.getTime());
    await sendAll(deps, [
      {
        rule: 'busy_organization',
        importId: started.importId,
        organizationId: started.organizationId,
        kind: started.kind,
        part: null,
        costUsd: null,
        facts,
      },
    ]);
  } catch (error) {
    console.error(
      `The activity of organization ${started.organizationId} was not checked: ${describe(error)}`
    );
  }
}

export function reportAlert(
  reported: {
    importId: string;
    organizationId: string;
    kind: ImportKind;
    part: ImportLibraryPart | null;
    costUsd: number | null;
  },
  accountId: string
): AlertMessage {
  return messageOf({ rule: 'reported', ...reported, facts: [`Reported by account ${accountId}`] });
}

const inside = (at: string | null, from: number, to: number) => {
  const time = timeOf(at);
  return time !== null && time >= from && time < to;
};

function momentsIn(
  own: { read: string | null; failed: string | null; ended: (string | null)[] },
  from: number,
  to: number
): Moment[] {
  const moments: Moment[] = [];
  if (inside(own.read, from, to) || (!own.read && inside(own.failed, from, to))) {
    moments.push('read');
  }
  if (own.ended.some((at) => inside(at, from, to))) moments.push('ended');
  if (inside(own.failed, from, to)) moments.push('cleanUp');
  return moments;
}

/**
 * The previous UTC day's imports. Its alert count is what the rules find in the day's events,
 * the busy organizations left out.
 */
export function daySummary(
  records: ImportDay[],
  from: Date,
  to: Date,
  cleanUpLine: string
): AlertMessage {
  const [start, end] = [from.getTime(), to.getTime()];
  const rows = records.map((record) => record.row);
  const count = (column: 'started_at' | 'confirmed_at' | 'abandoned_at' | 'failed_at') =>
    rows.filter((row) => inside(row[column], start, end)).length;
  let changed = 0;
  let whole = 0;
  let alerts = 0;
  for (const record of records) {
    const { row } = record;
    const confirmed = [
      ...(inside(row.confirmed_at, start, end) ? [row] : []),
      ...record.parts.filter((part) => inside(part.confirmed_at, start, end)),
    ];
    for (const own of confirmed) {
      const share = changedShare(own.quality, flagsOf(own.reading_flags)?.proposedValues);
      if (share) {
        changed += share.changed;
        whole += share.whole;
      }
    }
    const ownMoments = momentsIn(
      {
        read: row.ready_at,
        failed: row.failed_at,
        ended: [row.confirmed_at, row.abandoned_at, row.failed_at],
      },
      start,
      end
    );
    alerts += ownMoments.flatMap((moment) => alertsOf(record, null, moment)).length;
    if (inside(row.reported_at, start, end)) alerts++;
    if (inside(row.expensive_alerted_at, start, end)) alerts++;
    for (const part of record.parts) {
      const moments = momentsIn(
        {
          read: part.read_at,
          failed: part.failed_at,
          ended: [part.confirmed_at, part.failed_at],
        },
        start,
        end
      );
      alerts += moments.flatMap((moment) => alertsOf(record, part.part, moment)).length;
      if (inside(part.reported_at, start, end)) alerts++;
    }
  }
  const cost = rows
    .filter((row) => inside(row.started_at, start, end))
    .reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  return {
    severity: 'summary',
    title: `Imports on ${from.toISOString().slice(0, 10)}`,
    lines: [
      `Started ${count('started_at')} · confirmed ${count('confirmed_at')} · abandoned ${count('abandoned_at')} · failed ${count('failed_at')}`,
      whole > 0
        ? `Proposed values changed or unticked: ${Math.round((changed / whole) * 100)}% (${changed} of ${whole})`
        : 'Proposed values changed or unticked: nothing confirmed',
      `Cost of the imports started: ${usd(cost)}`,
      `Alerts: ${alerts}`,
      `Clean-up: ${cleanUpLine}`,
    ],
  };
}
