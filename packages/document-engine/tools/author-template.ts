import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  authorTemplate,
  documentText,
  type Replacement,
  type Wording,
  wordingReplacements,
} from '../src/author';
import { templatePlaceholders } from '../src/render';

// Makes a template from a provider's Word file, which stays outside the repository:
//
//   pnpm --filter @ssm-usor/document-engine author -- --text <source.docx>
//   pnpm --filter @ssm-usor/document-engine author -- <source.docx> <spec.json> <template.docx>
//
// The first form prints the document's text, to write the spec from. The spec lists literal
// texts and the placeholders that replace them. It quotes the original, real names included,
// so it lives with the originals in the git-ignored `originals/` folder, not in the
// repository. Replacements apply in order, so list a longer text before a shorter one it
// contains.

const { values, positionals } = parseArgs({
  options: { text: { type: 'boolean', default: false } },
  allowPositionals: true,
});

const [sourcePath, specPath, outputPath] = positionals;
if (!sourcePath || (!values.text && (!specPath || !outputPath))) {
  console.error('Usage: author [--text] <source.docx> [<spec.json> <template.docx>]');
  process.exit(1);
}

const source = new Uint8Array(readFileSync(sourcePath));
if (values.text) {
  console.log(documentText(source));
  process.exit(0);
}

const spec = JSON.parse(readFileSync(specPath!, 'utf8')) as {
  replacements: Replacement[];
  removeColors?: string[];
  /** A wording file, relative to the spec, applied after the spec's own replacements. */
  wording?: string;
};
const wording = spec.wording
  ? wordingReplacements(
      JSON.parse(readFileSync(resolve(dirname(specPath!), spec.wording), 'utf8')) as Wording
    )
  : [];
const { template, report } = authorTemplate(source, [...spec.replacements, ...wording], {
  removeColors: spec.removeColors,
});
writeFileSync(outputPath!, template);

// The spec's own replacements one by one; the shared wording as a total.
const own = new Set(
  spec.replacements.map(({ find, pattern }) => (pattern ? `/${pattern}/` : find))
);
for (const { part, find, count } of report.filter((entry) => own.has(entry.find))) {
  console.log(`${String(count).padStart(3)} × ${JSON.stringify(find)} in ${part}`);
}
const reworded = report.filter((entry) => !own.has(entry.find));
if (wording.length > 0) {
  const total = reworded.reduce((sum, entry) => sum + entry.count, 0);
  console.log(`${String(total).padStart(3)} × wording fixes (${reworded.length} distinct)`);
}
console.log(`\n${basename(outputPath!)} uses: ${templatePlaceholders(template).join(', ')}`);
