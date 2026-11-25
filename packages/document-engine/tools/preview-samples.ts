import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderDocument, TemplateError } from '../src/render';
import { signingTypeKeys } from '../src/signing';
import { dutiesAcknowledgementTypeKey } from '../src/ssm-duties';
import { manifestEntries, templateSets } from '../src/template-store';
import { testSheetTypeKey } from '../src/test-sheet';
import { dutiesAcknowledgementSamples } from './duties-acknowledgement-samples';
import {
  type KnowledgeTestCode,
  knowledgeTestData,
  knowledgeTestTemplates,
} from './knowledge-test-samples';
import { setSamples } from './set-samples';
import { signingAgreementSamples } from './signing-samples';
import { testSheetSamples } from './test-sheet-samples';
import { trainingSheetSamples } from './training-sheet-samples';

export interface PreviewDocument {
  /** The template's file name, without its folder. */
  name: string;
  label: string;
  docx: Uint8Array;
}

export interface PreviewDocuments {
  documents: PreviewDocument[];
  /** A sample a template asks a field of that the sample does not give, with the reason. */
  skipped: string[];
}

export function previewDocuments(templates: URL): PreviewDocuments {
  const files = templateSets
    .filter(({ set }) => set !== 'other')
    .map(({ folder }) => fileURLToPath(new URL(folder, templates)))
    .filter((folder) => existsSync(folder))
    .flatMap((folder) =>
      readdirSync(folder)
        .filter((file) => file.endsWith('.docx'))
        .map((name) => ({ folder, name }))
    );
  const templatesPath = fileURLToPath(templates);
  // The per-employee templates are merged with an employee's data, not a client's.
  const employeeSamples = new Map<string, { label: string; data: Record<string, unknown> }[]>(
    manifestEntries(templates)
      .filter((entry) => entry.perEmployee)
      .map((entry) => [
        `${templatesPath}${entry.path}`,
        entry.typeKey === signingTypeKeys.agreement
          ? signingAgreementSamples()
          : entry.typeKey === dutiesAcknowledgementTypeKey
            ? dutiesAcknowledgementSamples()
            : entry.typeKey === testSheetTypeKey
              ? testSheetSamples()
              : trainingSheetSamples(entry.typeKey.endsWith('_su') ? 'su' : 'ssm'),
      ])
  );
  const knowledgeTestCodes = new Map(
    (Object.entries(knowledgeTestTemplates) as [KnowledgeTestCode, string][]).map(
      ([code, file]) => [`${templatesPath}${file}`, code]
    )
  );
  const documents: PreviewDocument[] = [];
  const skipped: string[] = [];
  for (const { folder, name } of files) {
    const template = new Uint8Array(readFileSync(`${folder}${name}`));
    const testCode = knowledgeTestCodes.get(`${folder}${name}`);
    for (const { label, data } of employeeSamples.get(`${folder}${name}`) ?? setSamples) {
      const merged = testCode
        ? { ...data, ...knowledgeTestData(testCode, label === 'long' ? 12 : 10) }
        : data;
      try {
        documents.push({ name, label, docx: renderDocument(template, merged) });
      } catch (error) {
        if (!(error instanceof TemplateError)) throw error;
        skipped.push(`${name} (${label}): ${error.message}`);
      }
    }
  }
  return { documents, skipped };
}
