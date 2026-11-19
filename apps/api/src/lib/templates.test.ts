import { describe, expect, it, vi } from 'vitest';

import { callsTo, routeUpstream, stubFetch, testEnv, testSecretKey } from '../test/upstream';
import { adminClient } from './admin-db';
import { ApiError } from './errors';
import { mergeBuiltIn } from './templates';

vi.mock('@ssm-usor/document-engine', () => ({
  TemplateError: class TemplateError extends Error {},
  renderTemplate: (template: Uint8Array, data: Record<string, unknown>) => ({
    document: new TextEncoder().encode(`${new TextDecoder().decode(template)}:${data.name}`),
    usedNames: ['name'],
  }),
}));

stubFetch();

const db = adminClient(testEnv({ SUPABASE_SECRET_KEY: testSecretKey }));

const templateRow = {
  type_key: 'training_sheet_ssm',
  title: 'Fișa de instruire',
  document_template_versions: [
    { id: 'v1', version: 1, storage_path: 'built-in/training_sheet_ssm/1.docx' },
    { id: 'v2', version: 2, storage_path: 'built-in/training_sheet_ssm/2.docx' },
  ],
};

describe('a form merged from its built-in template', () => {
  it("merges the template's newest version and says where it was read from", async () => {
    routeUpstream({ '/rest/v1/document_templates': () => [templateRow] });
    const readTemplate = vi.fn(async (path: string) => new TextEncoder().encode(path));

    const merged = await mergeBuiltIn(
      db,
      readTemplate,
      'training_sheet_ssm',
      { name: 'Ion POP', unused: true },
      'training sheet'
    );

    expect(readTemplate).toHaveBeenCalledWith('built-in/training_sheet_ssm/2.docx');
    expect(new TextDecoder().decode(merged.bytes)).toBe(
      'built-in/training_sheet_ssm/2.docx:Ion POP'
    );
    expect(merged.snapshot).toEqual({ name: 'Ion POP' });
    expect(merged.storagePath).toBe('built-in/training_sheet_ssm/2.docx');
    expect(callsTo('/rest/v1/document_templates')[0]!.url.searchParams.get('organization_id')).toBe(
      'is.null'
    );
  });

  it('answers 503 template_missing, naming the document, while the template is not registered', async () => {
    routeUpstream({ '/rest/v1/document_templates': () => [] });
    const readTemplate = vi.fn(async () => new Uint8Array());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const failure = await mergeBuiltIn(db, readTemplate, 'test_sheet', {}, 'test sheet').catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: 'service_unavailable',
      message: 'The test sheet template is not available yet.',
      reason: 'template_missing',
    });
    expect(readTemplate).not.toHaveBeenCalled();
  });
});
