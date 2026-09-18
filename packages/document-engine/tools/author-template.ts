import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { authorTemplate, documentText, type Replacement } from '../src/author';
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
};
const { template, report } = authorTemplate(source, spec.replacements, {
  removeColors: spec.removeColors,
});
writeFileSync(outputPath!, template);

for (const { part, find, count } of report) {
  console.log(`${String(count).padStart(3)} × ${JSON.stringify(find)} in ${part}`);
}
console.log(`\n${basename(outputPath!)} uses: ${templatePlaceholders(template).join(', ')}`);
