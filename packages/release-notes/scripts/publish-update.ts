import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { countItems, parseReleaseBody } from '../src/index.js';
import { fail, required } from './cli.js';
import { describeCounts, describeErrors, releaseRow } from './release.js';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    tag: { type: 'string' },
    'published-at': { type: 'string' },
    body: { type: 'string' },
  },
});

const body = readFileSync(required(values.body, 'body'), 'utf8');

if (values.check) {
  const parsed = parseReleaseBody(body);
  if (parsed.kind === 'invalid') fail(describeErrors(parsed.errors));
  console.log(
    parsed.kind === 'silent'
      ? 'The release is silent: its body holds no update.'
      : `The update parses: "${parsed.update.headline}", ${describeCounts(countItems(parsed.update))}.`
  );
  process.exit(0);
}

const tag = required(values.tag, 'tag');
if (!/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(tag)) fail([`${tag} is not a release tag.`]);
const publishedAt = required(values['published-at'], 'published-at');
if (Number.isNaN(Date.parse(publishedAt))) fail([`${publishedAt} is not a time.`]);

const result = releaseRow(tag, publishedAt, body);
if (result.kind === 'invalid') fail(describeErrors(result.errors));
if (result.kind === 'silent') {
  console.log(`${tag} is silent; no row is written.`);
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) fail(['Set SUPABASE_URL and SUPABASE_SECRET_KEY.']);

const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error } = await client.from('releases').upsert(result.row, { onConflict: 'tag' });
if (error) fail([`Writing ${tag} to releases failed: ${error.message}`]);
console.log(
  `Wrote the update of ${tag}, "${result.row.headline}": ${describeCounts(countItems(result.row))}.`
);
