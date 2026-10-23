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

export type AssembledRelease =
  | { kind: 'assembled'; body: string; summary: string }
  | { kind: 'invalid'; failures: PullRequestFailure[] };

export function assembleRelease(pullRequests: PullRequest[], trailer: string): AssembledRelease {
  const blocks: UpdateSections[] = [];
  const contributed: PullRequest[] = [];
  const skipped: PullRequest[] = [];
  const failures: PullRequestFailure[] = [];

  for (const pullRequest of pullRequests) {
    const result = parsePullRequestBlock(pullRequest.body ?? '');
    if (result.kind === 'invalid') {
      failures.push({ pullRequest, errors: result.errors });
    } else if (result.kind === 'none') {
      skipped.push(pullRequest);
    } else {
      blocks.push(result.sections);
      contributed.push(pullRequest);
    }
  }
  if (failures.length > 0) return { kind: 'invalid', failures };

  const body = assembleReleaseBody({ blocks, trailer });
  return { kind: 'assembled', body, summary: summarize(pullRequests, contributed, skipped, body) };
}

function summarize(
  all: PullRequest[],
  contributed: PullRequest[],
  skipped: PullRequest[],
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
      `Silent: none of the ${all.length} pull requests carries a \`## Actualizări\` block.`
    );
  } else {
    lines.push(
      `Headline: ${parsed.update.headline}`,
      '',
      `${describeCounts(countItems(parsed.update))}.`
    );
  }
  if (contributed.length > 0) {
    lines.push('', 'Contributed:', ...contributed.map(listItem));
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
