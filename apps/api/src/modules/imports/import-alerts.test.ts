import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertText } from '../../lib/alerts';
import type { ImportMessage } from '../../lib/env';
import {
  alertBusyOrganization,
  alertImport,
  alertsOf,
  daySummary,
  failureCode,
  importEnded,
  messageOf,
  reportAlert,
} from './import-alerts';
import { libraryReasons, riskReasons } from './library';
import { importReasons, tooMuchText } from './pipeline';
import type { ImportRecord, ImportRecordRow, ImportRecords, PartRecordRow } from './records';

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

const personalData = /Popescu|BRUTĂRIA|Brutar|1850312350011|12345674|Fișă|\.jpg|\.docx|Dosar/;

function row(overrides: Partial<ImportRecordRow> = {}): ImportRecordRow {
  return {
    id: importId,
    organization_id: organizationId,
    kind: 'client',
    status: 'ready',
    client_id: null,
    into_existing_client: false,
    failure_reason: null,
    created_at: '2026-11-03T09:00:00Z',
    started_at: '2026-11-03T09:01:00Z',
    ready_at: '2026-11-03T09:10:00Z',
    failed_at: null,
    confirmed_at: null,
    abandoned_at: null,
    reported_at: null,
    proposal: {
      client: { legalName: { options: [{ value: 'BRUTĂRIA FICTIVĂ S.R.L.' }] } },
      employees: [{ lastName: 'Popescu', firstName: 'Ion', cnp: '1850312350011' }],
    },
    changes: null,
    quality: null,
    reading_version: null,
    reading_flags: null,
    read_characters: 1000,
    input_tokens: 1000,
    cached_input_tokens: 0,
    output_tokens: 100,
    cost_usd: 0.12,
    usage_by_step: null,
    ...overrides,
  };
}

function part(overrides: Partial<PartRecordRow> = {}): PartRecordRow {
  return {
    part: 'risk_evaluations',
    status: 'to_review',
    attempt: 1,
    failure_reason: null,
    read_at: '2026-11-03T09:20:00Z',
    failed_at: null,
    confirmed_at: null,
    reported_at: null,
    proposal: null,
    changes: null,
    quality: null,
    reading_version: null,
    reading_flags: null,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    ...overrides,
  };
}

const record = (
  overrides: Partial<ImportRecordRow> = {},
  parts: PartRecordRow[] = []
): ImportRecord => ({ row: row(overrides), files: [], parts });

const rules = (alerts: { rule: string }[]) => alerts.map((alert) => alert.rule);

const textOf = (alerts: ReturnType<typeof alertsOf>) =>
  alerts.map((alert) => alertText(messageOf(alert), 'production'));

const flags = {
  files: {
    total: 9,
    byKind: { decision: 4, risk_assessment: 3, pdf: 2 },
    unreadable: [{ file: 3, kind: 'pdf' }],
    setAside: 1,
    forEmployees: 0,
    otherCompany: 0,
  },
  found: { jobPositions: 0 },
  emptyRequired: ['client.legalName', 'client.cui', 'jobPositions'],
  checks: { quote_not_found: 4 },
  nothingFound: [{ file: 5, kind: 'risk_assessment' }],
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('failureCode', () => {
  it('names a reason by its code, never by its text', () => {
    expect(failureCode(importReasons.modelFailed)).toBe('import.modelFailed');
    expect(failureCode(importReasons.overLimits.employees)).toBe('import.overLimits');
    expect(failureCode(libraryReasons.stalled)).toBe('instructions.stalled');
    expect(failureCode(riskReasons.modelRefused)).toBe('risks.modelRefused');
    expect(failureCode(tooMuchText([{ name: 'Fișă Popescu.docx', characters: 900_000 }]))).toBe(
      'import.tooMuchText'
    );
    expect(failureCode('Este despre altă firmă: BRUTĂRIA FICTIVĂ S.R.L.')).toBe('other');
    expect(failureCode(null)).toBeNull();
  });
});

describe('the rules checked as a reading ends', () => {
  it('trips on a file sorted as a kind that gave nothing, one we could not open, and no required field', () => {
    const alerts = alertsOf(record({ reading_flags: flags }), null, 'read');
    expect(rules(alerts)).toEqual(['nothing_found', 'no_required_field', 'unreadable_files']);
    const [nothing, required, unreadable] = textOf(alerts);
    expect(nothing).toContain('🟡 **Sorted, but nothing found** · production');
    expect(nothing).toContain('file 5 of 9, risk_assessment');
    expect(required).toContain('No company name, no CUI and no post proposed');
    expect(required).toContain('decision 4, risk_assessment 3, pdf 2');
    expect(unreadable).toContain('file 3 of 9, pdf');
  });

  it('stays quiet on a reading that found what it read', () => {
    const quiet = {
      ...flags,
      files: { ...flags.files, unreadable: [] },
      emptyRequired: ['client.cui'],
      nothingFound: [],
    };
    expect(alertsOf(record({ reading_flags: quiet }), null, 'read')).toEqual([]);
    expect(alertsOf(record(), null, 'read')).toEqual([]);
  });

  it('asks for the company name, the CUI and the posts only of a client reading', () => {
    expect(
      rules(
        alertsOf(
          record({ kind: 'employees', reading_flags: { ...flags, nothingFound: [] } }),
          null,
          'read'
        )
      )
    ).toEqual(['unreadable_files']);
  });

  it('trips once on the import whose cost, with its parts, passes $1', () => {
    expect(rules(alertsOf(record({ cost_usd: 1.2 }), null, 'read'))).toEqual(['expensive']);
    expect(rules(alertsOf(record({ cost_usd: 1 }), null, 'read'))).toEqual([]);
    const crossing = record({ cost_usd: 1.3 }, [part({ cost_usd: 0.5 })]);
    expect(rules(alertsOf(crossing, 'risk_evaluations', 'read'))).toEqual(['expensive']);
    const past = record({ cost_usd: 1.8 }, [part({ cost_usd: 0.5 })]);
    expect(rules(alertsOf(past, 'risk_evaluations', 'read'))).toEqual([]);
  });

  it("checks a part's own flags for an assessment that gave no factor", () => {
    const own = part({
      reading_flags: {
        found: {},
        checks: {},
        nothingFound: [{ file: 2, kind: 'risk_assessment' }],
      },
    });
    const alerts = alertsOf(record({}, [own]), 'risk_evaluations', 'read');
    expect(rules(alerts)).toEqual(['nothing_found']);
    expect(textOf(alerts)[0]).toContain(`Import: client ${importId}, part risk_evaluations`);
  });
});

describe('the rules checked as an import or a part ends', () => {
  it('trips on a failure whose reason is ours, and not on one that is the files', () => {
    for (const reason of [
      importReasons.unavailable,
      importReasons.notConfigured,
      importReasons.modelRefused,
      importReasons.modelFailed,
      importReasons.failed,
      importReasons.scansUnfinished,
    ]) {
      expect(
        rules(alertsOf(record({ status: 'failed', failure_reason: reason }), null, 'ended'))
      ).toEqual(['failed']);
    }
    for (const reason of [importReasons.nothingToRead, importReasons.overLimits.client]) {
      expect(alertsOf(record({ status: 'failed', failure_reason: reason }), null, 'ended')).toEqual(
        []
      );
    }
    const failed = part({ status: 'failed', failure_reason: riskReasons.modelFailed });
    const alerts = alertsOf(record({}, [failed]), 'risk_evaluations', 'ended');
    expect(textOf(alerts)[0]).toContain('🔴 **Failed on our side**');
    expect(textOf(alerts)[0]).toContain('Reason: risks.modelFailed');
  });

  it('trips on a confirmation where the member changed or unticked more than half', () => {
    const mostly = record({
      status: 'confirmed',
      quality: { people: { changed: 5, unticked: 1, kept: 4 } },
    });
    expect(textOf(alertsOf(mostly, null, 'ended'))[0]).toContain(
      'Changed or unticked 6 of 10 proposed (60%)'
    );
    const half = record({
      status: 'confirmed',
      quality: { people: { changed: 4, unticked: 1, kept: 5 } },
    });
    expect(alertsOf(half, null, 'ended')).toEqual([]);
    const client = record({
      status: 'confirmed',
      quality: { client: { changed: 3, unticked: 0, kept: 0 } },
      reading_flags: { found: {}, checks: {}, proposedValues: 30 },
    });
    expect(alertsOf(client, null, 'ended')).toEqual([]);
    const ownPart = part({
      status: 'confirmed',
      quality: {
        sheets: { changed: 2, unticked: 0, kept: 0 },
        factors: { changed: 9, unticked: 1, kept: 2 },
      },
    });
    expect(rules(alertsOf(record({}, [ownPart]), 'risk_evaluations', 'ended'))).toEqual([
      'mostly_changed',
    ]);
  });

  it('trips on an import the member abandoned after its reading, not before it, nor after a failure', () => {
    expect(
      rules(
        alertsOf(
          record({ status: 'abandoned', abandoned_at: '2026-11-03T10:00:00Z' }),
          null,
          'ended'
        )
      )
    ).toEqual(['abandoned_after_reading']);
    expect(alertsOf(record({ status: 'abandoned', ready_at: null }), null, 'ended')).toEqual([]);
    expect(
      alertsOf(record({ status: 'abandoned', failed_at: '2026-11-03T09:30:00Z' }), null, 'ended')
    ).toEqual([]);
  });
});

describe('the rules checked by the clean-up', () => {
  it('trips on what it failed as stalled, the import or a part', () => {
    expect(
      rules(
        alertsOf(
          record({ status: 'failed', failure_reason: importReasons.stalled }),
          null,
          'cleanUp'
        )
      )
    ).toEqual(['stuck']);
    const stalled = part({
      status: 'failed',
      failure_reason: libraryReasons.stalled,
      part: 'instructions_ssm',
    });
    expect(rules(alertsOf(record({}, [stalled]), 'instructions_ssm', 'cleanUp'))).toEqual([
      'stuck',
    ]);
  });

  it('trips on an import left 14 days after its reading, and not on one left uploading', () => {
    expect(
      rules(
        alertsOf(record({ status: 'failed', failure_reason: importReasons.left }), null, 'cleanUp')
      )
    ).toEqual(['abandoned_after_reading']);
    expect(
      alertsOf(
        record({ status: 'failed', failure_reason: importReasons.left, ready_at: null }),
        null,
        'cleanUp'
      )
    ).toEqual([]);
  });

  it('trips on a part left to review until it expired', () => {
    const confirmed = { status: 'confirmed' as const, confirmed_at: '2026-10-20T10:00:00Z' };
    expect(rules(alertsOf(record(confirmed, [part()]), 'risk_evaluations', 'expired'))).toEqual([
      'abandoned_after_reading',
    ]);
    expect(
      alertsOf(record(confirmed, [part({ status: 'nothing_new' })]), 'risk_evaluations', 'expired')
    ).toEqual([]);
  });
});

describe('a message', () => {
  it('names the rule, the import and its organization, its counts and its cost, and nothing personal', () => {
    const everything = [
      ...alertsOf(record({ reading_flags: flags, cost_usd: 1.5 }), null, 'read'),
      ...alertsOf(
        record({
          status: 'failed',
          failure_reason: tooMuchText([{ name: 'Fișă Popescu.docx', characters: 900_000 }]),
        }),
        null,
        'ended'
      ),
    ];
    expect(rules(everything)).toEqual([
      'nothing_found',
      'no_required_field',
      'unreadable_files',
      'expensive',
    ]);
    const texts = [
      ...textOf(everything),
      alertText(
        reportAlert(
          { importId, organizationId, kind: 'employees', part: null, costUsd: 0.4 },
          '0f7c8d96-479c-47b3-b49e-01f4555a0221'
        ),
        'production'
      ),
    ];
    for (const text of texts) {
      expect(text).toContain(importId);
      expect(text).toContain(organizationId);
      expect(text).not.toMatch(personalData);
    }
    expect(texts[3]).toBe(
      [
        '🟡 **Expensive import** · production',
        `Import: client ${importId}`,
        `Organization: ${organizationId}`,
        'The import with its parts cost $1.50, over $1.00',
        'Cost: $1.50',
      ].join('\n')
    );
    expect(texts.at(-1)).toBe(
      [
        '🔴 **Reported by the member** · production',
        `Import: employees ${importId}`,
        `Organization: ${organizationId}`,
        'Reported by account 0f7c8d96-479c-47b3-b49e-01f4555a0221',
        'Cost: $0.40',
      ].join('\n')
    );
  });
});

function fakes(found: ImportRecord | null = record()) {
  const sent: string[] = [];
  const queued: ImportMessage[] = [];
  const records = {
    get: vi.fn(async () => found),
    recordCopy: vi.fn(),
    uncopied: vi.fn(async () => []),
    activity: vi.fn(async () => ({ startedLastHour: 0, spentTodayUsd: 0 })),
    between: vi.fn(async () => []),
  } satisfies ImportRecords;
  return {
    sent,
    queued,
    deps: {
      records,
      alerts: {
        enabled: true,
        send: async (message: Parameters<typeof alertText>[0]) => {
          sent.push(alertText(message, 'non-prod'));
          return true;
        },
      },
      queue: {
        send: async (body: ImportMessage) => {
          queued.push(body);
        },
        sendBatch: async () => {},
      },
    },
  };
}

describe('importEnded', () => {
  it("sends the end's alerts, then queues the copy", async () => {
    const { deps, sent, queued } = fakes(
      record({}, [part({ status: 'failed', failure_reason: riskReasons.failed })])
    );
    await importEnded(deps, importId, 'risk_evaluations');
    expect(sent).toHaveLength(1);
    expect(queued).toEqual([{ type: 'keep', importId, part: 'risk_evaluations' }]);
  });

  it('never throws, and still queues the copy, when the import cannot be read', async () => {
    const { deps, queued } = fakes();
    deps.records.get.mockRejectedValueOnce(new Error('database down'));
    await expect(importEnded(deps, importId, null)).resolves.toBeUndefined();
    expect(queued).toEqual([{ type: 'keep', importId }]);
    deps.queue.send = async () => {
      throw new Error('queue down');
    };
    await expect(importEnded(deps, importId, null)).resolves.toBeUndefined();
  });

  it('sends nothing for an import that is gone', async () => {
    const { deps, sent } = fakes(null);
    await alertImport(deps, importId, null, ['read', 'ended']);
    expect(sent).toEqual([]);
  });
});

describe('alertBusyOrganization', () => {
  it('trips past 10 imports started in an hour, or $5 spent since midnight, once an hour', async () => {
    const { deps, sent } = fakes();
    const started = { importId, organizationId, kind: 'client' as const };
    const now = new Date('2026-11-04T12:00:00Z');
    deps.records.activity.mockResolvedValue({ startedLastHour: 10, spentTodayUsd: 5 });
    await alertBusyOrganization(deps, started, now);
    expect(sent).toEqual([]);
    deps.records.activity.mockResolvedValue({ startedLastHour: 11, spentTodayUsd: 5.2 });
    await alertBusyOrganization(deps, started, now);
    await alertBusyOrganization(deps, started, new Date('2026-11-04T12:30:00Z'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('🔴 **Busy organization** · non-prod');
    expect(sent[0]).toContain('11 imports started in the last hour, over 10');
    expect(sent[0]).toContain('$5.20 spent on imports started since midnight UTC, over $5.00');
    await alertBusyOrganization(deps, started, new Date('2026-11-04T13:01:00Z'));
    expect(sent).toHaveLength(2);
  });
});

describe('daySummary', () => {
  it("sums up the day's imports, what members changed, the cost, the alerts and the clean-up", () => {
    const from = new Date('2026-11-03T00:00:00Z');
    const to = new Date('2026-11-04T00:00:00Z');
    const records = [
      record({
        status: 'confirmed',
        confirmed_at: '2026-11-03T11:00:00Z',
        quality: { people: { changed: 1, unticked: 0, kept: 9 } },
        cost_usd: 0.5,
      }),
      record({
        id: 'b',
        status: 'failed',
        ready_at: null,
        failed_at: '2026-11-03T09:05:00Z',
        failure_reason: importReasons.modelFailed,
        cost_usd: 0.25,
        reported_at: '2026-11-03T09:06:00Z',
      }),
      record(
        {
          id: 'c',
          status: 'abandoned',
          started_at: '2026-11-02T09:00:00Z',
          ready_at: '2026-11-02T09:10:00Z',
          abandoned_at: '2026-11-03T08:00:00Z',
        },
        [
          part({
            status: 'confirmed',
            confirmed_at: '2026-11-03T08:00:00Z',
            read_at: '2026-11-02T10:00:00Z',
            quality: { factors: { changed: 1, unticked: 0, kept: 9 } },
          }),
        ]
      ),
    ];
    const summary = alertText(
      daySummary(records, from, to, '2 folders copied, 0 not.'),
      'production'
    );
    expect(summary).toBe(
      [
        '📋 **Imports on 2026-11-03** · production',
        'Started 2 · confirmed 1 · abandoned 1 · failed 1',
        'Proposed values changed or unticked: 10% (2 of 20)',
        'Cost of the imports started: $0.75',
        'Alerts: 3',
        'Clean-up: 2 folders copied, 0 not.',
      ].join('\n')
    );
  });

  it('still posts a day with no import', () => {
    const summary = daySummary(
      [],
      new Date('2026-11-03T00:00:00Z'),
      new Date('2026-11-04T00:00:00Z'),
      'nothing to do.'
    );
    expect(summary.lines).toContain('Alerts: 0');
    expect(summary.lines).toContain('Proposed values changed or unticked: nothing confirmed');
  });
});
