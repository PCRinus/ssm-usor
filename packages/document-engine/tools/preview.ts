import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderDocument, TemplateError } from '../src/render';
import { signingTypeKeys } from '../src/signing';
import { manifestEntries, templateSets } from '../src/template-store';
import { testSheetTypeKey } from '../src/test-sheet';
import {
  type KnowledgeTestCode,
  knowledgeTestData,
  knowledgeTestTemplates,
} from './knowledge-test-samples';
import { setSamples } from './set-samples';
import { signingAgreementSamples } from './signing-samples';
import { testSheetSamples } from './test-sheet-samples';
import { trainingSheetSamples } from './training-sheet-samples';

// The PDFs land in `originals/preview/`, which git ignores.

const root = fileURLToPath(new URL('..', import.meta.url));
// preview [templates-dir] [output-dir], both relative to the package.
const [templatesArgument = 'templates', outputArgument = 'originals/preview'] =
  process.argv.slice(2);
const templates = `${root}${templatesArgument}/`;
const output = `${root}${outputArgument}/`;

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const files = templateSets
  .filter(({ set }) => set !== 'other')
  .map(({ folder }) => `${templates}${folder}`)
  .filter((folder) => existsSync(folder))
  .flatMap((folder) =>
    readdirSync(folder)
      .filter((file) => file.endsWith('.docx'))
      .map((name) => ({ folder, name }))
  );
// The per-employee templates are merged with an employee's data, not a client's.
const employeeSamples = new Map<string, { label: string; data: Record<string, unknown> }[]>(
  manifestEntries(pathToFileURL(templates))
    .filter((entry) => entry.perEmployee)
    .map((entry) => [
      `${templates}${entry.path}`,
      entry.typeKey === signingTypeKeys.agreement
        ? signingAgreementSamples()
        : entry.typeKey === testSheetTypeKey
          ? testSheetSamples()
          : trainingSheetSamples(entry.typeKey.endsWith('_su') ? 'su' : 'ssm'),
    ])
);
const knowledgeTestCodes = new Map(
  (Object.entries(knowledgeTestTemplates) as [KnowledgeTestCode, string][]).map(([code, file]) => [
    `${templates}${file}`,
    code,
  ])
);
for (const { folder, name } of files) {
  const template = new Uint8Array(readFileSync(`${folder}${name}`));
  const testCode = knowledgeTestCodes.get(`${folder}${name}`);
  for (const { label, data } of employeeSamples.get(`${folder}${name}`) ?? setSamples) {
    const merged = testCode
      ? { ...data, ...knowledgeTestData(testCode, label === 'long' ? 12 : 10) }
      : data;
    try {
      writeFileSync(
        `${output}${name.replace(/\.docx$/, '')}.${label}.docx`,
        renderDocument(template, merged)
      );
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      console.warn(`${name} (${label}) skipped: ${error.message}`);
    }
  }
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
  const pages = readFileSync(`${output}${file}`)
    .toString('latin1')
    .match(/\/Type\s*\/Page[^s]/g)?.length;
  console.log(`${file}: ${pages} pages`);
}
