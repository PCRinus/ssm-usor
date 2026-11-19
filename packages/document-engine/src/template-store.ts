import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  type Citation,
  templateCitations,
  type TemplateSet,
  type TemplateSource,
} from './citations';
import type { ResolvedLegalChange, TemplateChange } from './template-change';

// The tests check an edited copy of the folder when DOCUMENT_TEMPLATES_DIR names one, as the
// replacement of a quote does before its pull request is opened (ADR 017).
const override = process.env.DOCUMENT_TEMPLATES_DIR;
export const templatesUrl = override
  ? pathToFileURL(`${resolve(override)}/`)
  : new URL('../templates/', import.meta.url);

export const templateSets = [
  { set: 'ssm', folder: '' },
  { set: 'fire', folder: 'fire/' },
  { set: 'other', folder: 'other/' },
] as const satisfies readonly { set: TemplateSet; folder: string }[];

export type TemplateSetFolder = (typeof templateSets)[number];

export interface ManifestEntry {
  /** Absent on a template that belongs to no set: a per-employee sheet (ADR 021). */
  number?: string;
  stage?: number;
  perEmployee?: true;
  /** The provider's document the template was imported from. */
  original?: string;
  originals?: string[];
  typeKey: string;
  title: string;
  /** The file's name in its set's folder. */
  file: string;
  change: Omit<TemplateChange, 'resolves'> & { resolves?: ResolvedLegalChange[] };
}

export interface TemplateEntry extends ManifestEntry {
  set: TemplateSet;
  /** The file's path in the templates folder: "fire/1.1_fire_decision_organization.docx". */
  path: string;
}

export function manifestEntries(
  base: URL = templatesUrl,
  sets: readonly TemplateSetFolder[] = templateSets
): TemplateEntry[] {
  return sets.flatMap(({ set, folder }) => {
    const { templates } = JSON.parse(
      readFileSync(new URL(`${folder}manifest.json`, base), 'utf8')
    ) as { templates: (Omit<ManifestEntry, 'change'> & { change: TemplateChange })[] };
    return templates.map(({ change: { resolves, ...change }, ...entry }) => ({
      ...entry,
      set,
      path: `${folder}${entry.file}`,
      change:
        resolves === undefined
          ? change
          : { ...change, resolves: Array.isArray(resolves) ? resolves : [resolves] },
    }));
  });
}

export function templateSources(base = templatesUrl): TemplateSource[] {
  return manifestEntries(base).map(({ set, path, typeKey }) => ({
    manifest: set,
    file: path,
    typeKey,
    source: new Uint8Array(readFileSync(new URL(path, base))),
  }));
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
