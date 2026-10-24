import { sectionTitles } from '../src/dialect.js';
import {
  assembleReleaseBody,
  countItems,
  type ItemCounts,
  type ParseError,
  parsePullRequestBlock,
  parseReleaseBody,
  type UpdateFeature,
  type UpdateSections,
} from '../src/index.js';
import type { DraftOutcome } from './draft.js';

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  body: string | null;
}

export interface PullRequestFailure {
  pullRequest: PullRequest;
  errors: ParseError[];
}

export interface Contribution {
  pullRequest: PullRequest;
  sections: UpdateSections;
}

export interface CollectedBlocks {
  kind: 'collected';
  contributions: Contribution[];
  skipped: PullRequest[];
}

export type CollectResult = CollectedBlocks | { kind: 'invalid'; failures: PullRequestFailure[] };

export interface AssembledRelease {
  body: string;
  summary: string;
}

export function collectBlocks(pullRequests: PullRequest[]): CollectResult {
  const contributions: Contribution[] = [];
  const skipped: PullRequest[] = [];
  const failures: PullRequestFailure[] = [];

  for (const pullRequest of pullRequests) {
    const result = parsePullRequestBlock(pullRequest.body ?? '');
    if (result.kind === 'invalid') {
      failures.push({ pullRequest, errors: result.errors });
    } else if (result.kind === 'none') {
      skipped.push(pullRequest);
    } else {
      contributions.push({ pullRequest, sections: result.sections });
    }
  }
  if (failures.length > 0) return { kind: 'invalid', failures };
  return { kind: 'collected', contributions, skipped };
}

export function assembleRelease(
  pullRequests: PullRequest[],
  collected: CollectedBlocks,
  trailer: string,
  draft: DraftOutcome
): AssembledRelease {
  const body =
    draft.kind === 'drafted'
      ? assembleReleaseBody({
          headline: draft.update?.headline,
          lead: draft.update?.lead,
          blocks: draft.update === null ? [] : [draft.update],
          trailer,
        })
      : assembleReleaseBody({
          blocks: collected.contributions.map((contribution) => contribution.sections),
          trailer,
        });
  return { body, summary: summarize(pullRequests, collected, draft, body) };
}

function summarize(
  all: PullRequest[],
  { contributions, skipped }: CollectedBlocks,
  draft: DraftOutcome,
  body: string
): string {
  const lines = ['### Update', ''];
  if (all.length === 0) {
    lines.push('Silent: no pull requests were merged since the previous release.');
    return lines.join('\n');
  }
  const parsed = parseReleaseBody(body);
  if (parsed.kind === 'invalid') {
    throw new Error(
      `The assembled body does not parse back: ${describeErrors(parsed.errors).join(' ')}`
    );
  }
  if (parsed.kind === 'silent') {
    lines.push(
      `Silent: none of the ${all.length} pull requests carries a \`## Actualizări\` block.`,
      '',
      draft.kind === 'drafted'
        ? `No lines proposed by ${draft.model}.`
        : `No lines proposed (no model: ${draft.reason}).`
    );
  } else {
    lines.push(
      `Headline: ${parsed.update.headline}`,
      '',
      draft.kind === 'drafted'
        ? `Headline and lead drafted by ${draft.model}.`
        : `Headline from the first item (no model: ${draft.reason}).`,
      '',
      `${describeCounts(countItems(parsed.update))}.`
    );
  }
  if (draft.kind === 'drafted' && draft.proposed.length > 0) {
    lines.push(
      '',
      'Proposed by the model for pull requests without a block, to check or delete before approving:',
      ...draft.proposed.map(
        (line) => `- #${line.pullRequest}, ${sectionTitles[line.section]}: ${line.text}`
      )
    );
  }
  if (contributions.length > 0) {
    lines.push(
      '',
      'Contributed:',
      ...contributions.map(({ pullRequest }) => listItem(pullRequest))
    );
  }
  if (skipped.length > 0) {
    lines.push('', 'No block, skipped:', ...skipped.map(listItem));
  }
  return lines.join('\n');
}

function listItem(pullRequest: PullRequest): string {
  return `- [#${pullRequest.number}](${pullRequest.url}) ${pullRequest.title}`;
}

export function describeCounts(counts: ItemCounts): string {
  return [
    plural(counts.features, 'new feature', 'new features'),
    plural(counts.improvements, 'improvement', 'improvements'),
    plural(counts.fixes, 'fix', 'fixes'),
  ].join(', ');
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function describeFailures(failures: PullRequestFailure[]): string[] {
  return failures.flatMap(({ pullRequest, errors }) =>
    errors.map(
      (error) =>
        `#${pullRequest.number} ${pullRequest.title}, line ${error.line} of its description: ${error.message}`
    )
  );
}

export interface ReleaseRow {
  tag: string;
  published_at: string;
  headline: string;
  lead: string | null;
  features: UpdateFeature[];
  improvements: string[];
  fixes: string[];
  body: string;
}

export type ReleaseRowResult =
  { kind: 'row'; row: ReleaseRow } | { kind: 'silent' } | { kind: 'invalid'; errors: ParseError[] };

export function releaseRow(tag: string, publishedAt: string, body: string): ReleaseRowResult {
  const parsed = parseReleaseBody(body);
  if (parsed.kind !== 'update') return parsed;
  const { headline, lead, features, improvements, fixes } = parsed.update;
  return {
    kind: 'row',
    row: {
      tag,
      published_at: publishedAt,
      headline,
      lead,
      features,
      improvements,
      fixes,
      body: parsed.source,
    },
  };
}

export function describeErrors(errors: ParseError[]): string[] {
  return errors.map((error) => `Line ${error.line} of the release body: ${error.message}`);
}
