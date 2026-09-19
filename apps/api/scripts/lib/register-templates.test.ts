import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { builtInTemplatePath, manifestSchema, registerTemplates } from './register-templates';

// sha256 of the three bytes below.
const sha256 = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const template = {
  typeKey: 'decision_first_aid',
  title: 'Decizia',
  bytes: new Uint8Array([1, 2, 3]),
};

function fixture() {
  const fetchMock = vi.fn<typeof fetch>();
  const db = createClient<Database>('https://example.supabase.co', 'sb_secret_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchMock },
  });
  return { db, fetchMock };
}

describe('registering built-in templates', () => {
  it('uploads the file under its hash, then registers the version', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ Key: 'document-templates/x' }))
      .mockResolvedValueOnce(
        Response.json([{ template_version_id: 'a', version: 1, created: true }])
      );
    const results = await registerTemplates(db, [template]);
    expect(results).toEqual([{ typeKey: 'decision_first_aid', version: 1, created: true }]);

    const [uploadUrl] = fetchMock.mock.calls[1]!;
    expect(String(uploadUrl)).toBe(
      `https://example.supabase.co/storage/v1/object/document-templates/${builtInTemplatePath('decision_first_aid', sha256)}`
    );
    const [rpcUrl, rpcInit] = fetchMock.mock.calls[2]!;
    expect(String(rpcUrl)).toContain('/rest/v1/rpc/register_built_in_template_version');
    expect(JSON.parse(String(rpcInit?.body))).toEqual({
      p_type_key: 'decision_first_aid',
      p_title: 'Decizia',
      p_storage_path: `built-in/decision_first_aid/${sha256}.docx`,
      p_sha256: sha256,
    });
  });

  it('does not send a file that is already in Storage', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json([{ template_version_id: 'a', version: 1, created: false }])
      );
    await expect(registerTemplates(db, [template])).resolves.toEqual([
      { typeKey: 'decision_first_aid', version: 1, created: false },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('HEAD');
  });

  it('accepts that another run uploaded the file in the meantime', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json(
          { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' },
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        Response.json([{ template_version_id: 'a', version: 1, created: false }])
      );
    await expect(registerTemplates(db, [template])).resolves.toHaveLength(1);
  });

  it('stops at an upload that fails, before registering anything', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json(
          { statusCode: '403', error: 'Unauthorized', message: 'nope' },
          { status: 400 }
        )
      );
    await expect(registerTemplates(db, [template])).rejects.toThrow(
      'Could not upload decision_first_aid: nope'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('the manifest of the document engine', () => {
  it('matches what the registration reads, with keys the database accepts', () => {
    const manifest = manifestSchema.parse(
      JSON.parse(
        readFileSync(
          new URL('../../../../packages/document-engine/templates/manifest.json', import.meta.url),
          'utf8'
        )
      )
    );
    expect(manifest.templates.length).toBeGreaterThan(0);
    expect(new Set(manifest.templates.map((entry) => entry.typeKey)).size).toBe(
      manifest.templates.length
    );
  });
});
