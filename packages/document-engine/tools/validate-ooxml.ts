// pnpm --filter @ssm-usor/document-engine validate-ooxml [folder]
//
// Nobody on the team has Word to open the files in, so the occupational safety set is checked
// against the schema with Microsoft's own validator instead (tools/ooxml, in a .NET container).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendAnnexes, renderAnnex } from '../src/annex';
import { renderDocument } from '../src/render';
import { templatesUrl } from '../src/template-store';
import { ssmAnnexData, ssmAnnexSample } from './annex-samples';
import { previewDocuments } from './preview-samples';
import { setSamples } from './set-samples';

const image = 'mcr.microsoft.com/dotnet/sdk:8.0';
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'ooxml-'));
const templates = fileURLToPath(templatesUrl);
const ssm = readdirSync(templates).filter((name) => name.endsWith('.docx'));

mkdirSync(join(out, 'templates'), { recursive: true });
mkdirSync(join(out, 'merged'), { recursive: true });
for (const name of ssm)
  writeFileSync(join(out, 'templates', name), readFileSync(join(templates, name)));
for (const { name, label, docx } of previewDocuments(templatesUrl).documents) {
  if (ssm.includes(name))
    writeFileSync(join(out, 'merged', `${name.replace(/\.docx$/, '')}.${label}.docx`), docx);
}
const annex = renderAnnex('ssm', ssmAnnexSample, ssmAnnexData);
writeFileSync(join(out, 'merged', 'annex.ssm.docx'), annex);
for (const { label, data } of setSamples) {
  const common = renderDocument(readFileSync(join(templates, '3.1_own_instructions.docx')), data);
  writeFileSync(
    join(out, 'merged', `3.1_own_instructions.${label}.with-annex.docx`),
    appendAnnexes(common, [annex])
  );
}

const validator = fileURLToPath(new URL('./ooxml/', import.meta.url));
const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${validator}:/src:ro`,
    '-v',
    `${out}:/docs:ro`,
    '-v',
    'ssm-usor-ooxml-nuget:/root/.nuget/packages',
    image,
    'sh',
    '-c',
    'cp -r /src /tmp/validate && cd /tmp/validate && dotnet run -c Release -- /docs',
  ],
  { stdio: 'inherit' }
);
console.log(`Checked the files in ${out}.`);
process.exit(run.status ?? 1);
