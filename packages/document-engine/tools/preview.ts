import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { wordsMissingFromPdf } from '../src/test/pdf-words';
import { previewDocuments } from './preview-samples';

// The PDFs land in `originals/preview/`, which git ignores.

const root = fileURLToPath(new URL('..', import.meta.url));
// preview [templates-dir] [output-dir], both relative to the package.
const [templatesArgument = 'templates', outputArgument = 'originals/preview'] =
  process.argv.slice(2);
const output = `${root}${outputArgument}/`;

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const { name, label, docx } of previewDocuments(
  pathToFileURL(`${root}${templatesArgument}/`)
)) {
  writeFileSync(`${output}${name.replace(/\.docx$/, '')}.${label}.docx`, docx);
}

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '-v',
    `${output}:/work`,
    'gotenberg/gotenberg:8',
    '-c',
    'cd /work && soffice --headless --convert-to pdf --outdir /work *.docx >/dev/null 2>&1',
  ],
  { stdio: 'inherit' }
);
for (const file of readdirSync(output)
  .filter((name) => name.endsWith('.pdf'))
  .sort()) {
  const pdf = new Uint8Array(readFileSync(`${output}${file}`));
  const pages = Buffer.from(pdf)
    .toString('latin1')
    .match(/\/Type\s*\/Page[^s]/g)?.length;
  const missing = await wordsMissingFromPdf(
    new Uint8Array(readFileSync(`${output}${file.replace(/\.pdf$/, '.docx')}`)),
    pdf
  );
  const words = missing.map(({ word, missing: count }) => (count > 1 ? `${word} ×${count}` : word));
  console.log(
    `${file}: ${pages} pages${words.length > 0 ? `, MISSING ${words.length} words: ${words.slice(0, 20).join(', ')}` : ''}`
  );
}
