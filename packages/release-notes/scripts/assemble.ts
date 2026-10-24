import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { fail, required, warn } from './cli.js';
import { draftUpdate } from './draft.js';
import { assembleRelease, collectBlocks, describeFailures, type PullRequest } from './release.js';

const { values } = parseArgs({
  options: {
    'pull-requests': { type: 'string' },
    trailer: { type: 'string' },
    out: { type: 'string' },
  },
});

const pullRequests = readPullRequests(required(values['pull-requests'], 'pull-requests'));
const trailer = values.trailer === undefined ? '' : readFileSync(values.trailer, 'utf8');
const out = required(values.out, 'out');

const collected = collectBlocks(pullRequests);
if (collected.kind === 'invalid') {
  fail([
    ...describeFailures(collected.failures),
    'Fix the ## Actualizări block in the description of each pull request named above, then run Deploy production again.',
  ]);
}
const draft = await draftUpdate(
  { pullRequests, contributions: collected.contributions },
  { apiKey: process.env.ANTHROPIC_API_KEY }
);
if (draft.kind === 'fallback' && process.env.ANTHROPIC_API_KEY && pullRequests.length > 0) {
  warn(`No model draft, the update keeps the first item as its headline: ${draft.reason}.`);
}
const result = assembleRelease(pullRequests, collected, trailer, draft);
writeFileSync(out, `${result.body}\n`);
console.log(result.summary);

function readPullRequests(path: string): PullRequest[] {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data) || !data.every(isPullRequest)) {
    fail([`${path} is not a list of { number, title, url, body } pull requests.`]);
  }
  return data;
}

function isPullRequest(value: unknown): value is PullRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { number, title, url, body } = value as Record<string, unknown>;
  return (
    typeof number === 'number' &&
    typeof title === 'string' &&
    typeof url === 'string' &&
    (typeof body === 'string' || body === null)
  );
}
