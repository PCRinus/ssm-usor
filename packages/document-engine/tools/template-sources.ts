import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  type Citation,
  templateCitations,
  type TemplateSet,
  type TemplateSource,
} from '../src/citations';

// The tests check an edited copy of the folder when DOCUMENT_TEMPLATES_DIR names one, as the
// replacement of a quote does before its pull request is opened (ADR 017).
const override = process.env.DOCUMENT_TEMPLATES_DIR;
export const templatesUrl = override
  ? pathToFileURL(`${resolve(override)}/`)
  : new URL('../templates/', import.meta.url);

const sets: { manifest: TemplateSet; folder: string }[] = [
  { manifest: 'ssm', folder: '' },
  { manifest: 'fire', folder: 'fire/' },
  { manifest: 'other', folder: 'other/' },
];

export function templateSources(base = templatesUrl): TemplateSource[] {
  return sets.flatMap(({ manifest, folder }) => {
    const { templates } = JSON.parse(
      readFileSync(new URL(`${folder}manifest.json`, base), 'utf8')
    ) as { templates: { typeKey: string; file: string }[] };
    return templates.map(({ typeKey, file }) => ({
      manifest,
      file: `${folder}${file}`,
      typeKey,
      source: new Uint8Array(readFileSync(new URL(`${folder}${file}`, base))),
    }));
  });
}

export interface CitationIndex {
  citations: Citation[];
}

export function buildCitationIndex(sources = templateSources()): CitationIndex {
  return { citations: sources.flatMap(templateCitations) };
}

export function serializeIndex(index: CitationIndex) {
  return `${JSON.stringify(index, null, 2)}\n`;
}
