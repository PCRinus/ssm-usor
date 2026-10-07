import { readFileSync } from 'node:fs';

import {
  type Citation,
  templateCitations,
  type TemplateSet,
  type TemplateSource,
} from '../src/citations';

export const templatesUrl = new URL('../templates/', import.meta.url);

const sets: { manifest: TemplateSet; folder: string }[] = [
  { manifest: 'ssm', folder: '' },
  { manifest: 'fire', folder: 'fire/' },
  { manifest: 'other', folder: 'other/' },
];

export function templateSources(): TemplateSource[] {
  return sets.flatMap(({ manifest, folder }) => {
    const { templates } = JSON.parse(
      readFileSync(new URL(`${folder}manifest.json`, templatesUrl), 'utf8')
    ) as { templates: { typeKey: string; file: string }[] };
    return templates.map(({ typeKey, file }) => ({
      manifest,
      file: `${folder}${file}`,
      typeKey,
      source: new Uint8Array(readFileSync(new URL(`${folder}${file}`, templatesUrl))),
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
