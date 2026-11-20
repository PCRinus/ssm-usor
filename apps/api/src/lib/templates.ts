import type { MissingDocumentData } from '@ssm-usor/contracts';
import { renderTemplate, TemplateError } from '@ssm-usor/document-engine';

import { type DataClient, fromDatabaseError } from './db';
import { ApiError } from './errors';

export type Template = { typeKey: string; title: string; versionId: string; storagePath: string };

export async function builtInTemplates(
  db: DataClient,
  typeKeys: readonly string[]
): Promise<Template[]> {
  const { data, error } = await db
    .from('document_templates')
    .select('type_key, title, document_template_versions(id, version, storage_path)')
    .is('organization_id', null)
    .in('type_key', [...typeKeys]);
  if (error) throw fromDatabaseError(error, 'built-in templates');
  return data.flatMap((template) => {
    const newest = template.document_template_versions.reduce<
      (typeof template.document_template_versions)[number] | null
    >((best, version) => (!best || version.version > best.version ? version : best), null);
    return newest
      ? [
          {
            typeKey: template.type_key,
            title: template.title,
            versionId: newest.id,
            storagePath: newest.storage_path,
          },
        ]
      : [];
  });
}

export function missingDocumentDataError(missing: MissingDocumentData[]) {
  return new ApiError(
    'conflict',
    `Data the documents print is missing: ${missing.join(', ')}.`,
    undefined,
    'missing_document_data',
    missing
  );
}

/**
 * The merged file, and the part of the data it printed. That part is the revision's snapshot:
 * a new first-aider then marks the first aid decision as out of date, not the whole set.
 * `printing` sets the data in type, for the file only.
 * `printedGaps` names the gaps behind the top-level names the template found no value for;
 * when there are any, the document is refused for them rather than left with a gap.
 */
export function merge(
  template: Uint8Array,
  data: Record<string, unknown>,
  typeKey: string,
  {
    printedGaps = () => [],
    printing = (same) => same,
  }: {
    printedGaps?: (absentNames: string[]) => MissingDocumentData[];
    printing?: (data: Record<string, unknown>) => Record<string, unknown>;
  } = {}
) {
  try {
    const { document, usedNames } = renderTemplate(template, printing(data));
    return {
      bytes: document,
      snapshot: Object.fromEntries(usedNames.map((name) => [name, data[name]])),
    };
  } catch (error) {
    if (error instanceof TemplateError) {
      const gaps = printedGaps([...new Set(error.missing.map((path) => path.split('.')[0]!))]);
      if (gaps.length > 0) throw missingDocumentDataError(gaps);
      // The readiness check should make this unreachable: a template asks for a name the
      // context does not have.
      console.error(`Template ${typeKey} could not be merged: ${error.message}`);
      throw new ApiError('internal_error', 'A document template could not be filled in.');
    }
    throw error;
  }
}

export async function mergeBuiltIn(
  db: DataClient,
  readTemplate: (storagePath: string) => Promise<Uint8Array>,
  typeKey: string,
  data: Record<string, unknown>,
  documentName: string,
  printing?: (data: Record<string, unknown>) => Record<string, unknown>
) {
  const [template] = await builtInTemplates(db, [typeKey]);
  if (!template) {
    console.error(`The template ${typeKey} is not registered: run pnpm templates:register.`);
    throw new ApiError(
      'service_unavailable',
      `The ${documentName} template is not available yet.`,
      undefined,
      'template_missing'
    );
  }
  const merged = merge(await readTemplate(template.storagePath), data, typeKey, { printing });
  return { ...merged, storagePath: template.storagePath };
}
