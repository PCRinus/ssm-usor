import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { type LegalQuoteInput, replaceLegalQuote } from './legal-quote';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { templates: { type: 'string' }, summary: { type: 'string' } },
});
const [inputPath] = positionals;
if (!inputPath) {
  console.error('Usage: replace-quote <input.json> [--templates <folder>] [--summary <file.json>]');
  process.exit(2);
}

try {
  const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as LegalQuoteInput;
  const templates = values.templates
    ? pathToFileURL(`${resolve(values.templates)}/`)
    : new URL('../templates/', import.meta.url);
  const result = replaceLegalQuote(templates, input);
  if (values.summary) {
    writeFileSync(resolve(values.summary), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(result.markdown);
  console.log(`\nWritten: ${result.written.join(', ') || 'nothing'}`);
  if (!input.change) console.log('No change given: the manifest entries are as they were.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
