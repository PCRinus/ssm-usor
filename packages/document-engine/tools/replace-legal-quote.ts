import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { type LegalQuoteInput, releasedManifestAt, replaceLegalQuote } from './legal-quote';

const usage = [
  'Usage: replace-quote <input.json> [--templates <folder>] [--released <git ref>] [--summary <file.json>]',
  'Exits 0 when the change is written, 3 when it needs a person, 4 when the quote holds none of',
  'what changed and nothing is written, 1 on an error, 2 on a wrong call.',
].join('\n');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    templates: { type: 'string' },
    released: { type: 'string' },
    summary: { type: 'string' },
  },
});
const [inputPath] = positionals;
if (!inputPath) {
  console.error(usage);
  process.exit(2);
}

try {
  const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as LegalQuoteInput;
  const templates = values.templates
    ? pathToFileURL(`${resolve(values.templates)}/`)
    : new URL('../templates/', import.meta.url);
  const result = replaceLegalQuote(templates, input, releasedManifestAt(values.released));
  if (values.summary) {
    writeFileSync(resolve(values.summary), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(result.markdown);
  // The scheduled fix opens an issue instead of a pull request on 3 and 4.
  if (result.status === 'needs-review') {
    process.exitCode = 3;
  } else if (result.status === 'nothing-to-apply') {
    process.exitCode = 4;
  } else {
    console.log(`\nWritten: ${result.written.join(', ') || 'nothing'}`);
    if (!input.change) console.log('No change given: the manifest entries are as they were.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
