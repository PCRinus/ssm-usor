import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';

import {
  type KnowledgeTestCode,
  knowledgeTestData,
  knowledgeTestTemplates,
} from '../../tools/knowledge-test-samples';
import type { TemplateSet } from '../citations';
import { manifestEntries, templatesUrl } from '../template-store';

export const read = (name: string) => new Uint8Array(readFileSync(new URL(name, templatesUrl)));
export const bodyOf = (name: string) => new PizZip(read(name)).file('word/document.xml')!.asText();
export const documentTextOf = (paragraph: string) =>
  [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

export const templateFiles = readdirSync(fileURLToPath(templatesUrl)).filter((name) =>
  name.endsWith('.docx')
);
export const fireFiles = readdirSync(fileURLToPath(new URL('fire/', templatesUrl)))
  .filter((name) => name.endsWith('.docx'))
  .map((name) => `fire/${name}`);
export const typesetFiles = [...templateFiles, ...fireFiles];
export const decisionFiles = templateFiles.filter((name) => name.includes('_decision_'));

// What the provider's originals printed. None of it may survive in a template. A date counts
// from 2020 on: the laws the documents quote are dated too, and older.
export const originals =
  /VELOCITA|PIPETECH|PROFLEX|SAFETY CORE|POPA|LUCA|CASAPU|TALO[SȘ]|GIURGEA|D-na|D-l |\b\d{2}\.\d{2}\.202\d\b/;

export const entries = manifestEntries();
// The individual training sheets (ADR 021), the signing agreement (ADR 023) and the test sheet
// (ADR 024) sit beside a set's templates and belong to no set.
export const setEntries = (set: TemplateSet) =>
  entries.filter((entry) => entry.set === set && !entry.perEmployee);
export const perEmployeeEntries = entries.filter((entry) => entry.perEmployee);
export const perEmployeeFiles = perEmployeeEntries.map((entry) => entry.path);
export const sheetEntries = perEmployeeEntries.filter((entry) =>
  entry.typeKey.startsWith('training_sheet_')
);

// The API merges a test's own questions into the context of its set, as a decision gets its number.
export const knowledgeTests = Object.entries(knowledgeTestTemplates) as [
  KnowledgeTestCode,
  string,
][];
export const questionsOf = (name: string) => {
  const test = knowledgeTests.find(([, file]) => file === name);
  return test ? knowledgeTestData(test[0], 10) : {};
};
