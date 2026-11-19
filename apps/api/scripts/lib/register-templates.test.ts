import { manifestEntries } from '@ssm-usor/document-engine/template-store';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { builtInTemplatePath, manifestEntrySchema, registerTemplates } from './register-templates';

// sha256 of the three bytes below.
const sha256 = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const template = {
  typeKey: 'decision_first_aid',
  title: 'Decizia',
  bytes: new Uint8Array([1, 2, 3]),
  kind: 'correction' as const,
  note: 'Versiunea inițială.',
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
      p_kind: 'correction',
      p_note: 'Versiunea inițială.',
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

describe('a version that resolves legal changes', () => {
  const entry = (resolves: unknown) => ({
    typeKey: 'general_training_material',
    title: 'Material',
    file: '2.2_general_training_material.docx',
    change: { kind: 'legal', note: 'Art. 36 alin. (2) în forma în vigoare.', resolves },
  });
  const change = { act: 'oug-195-2002', consolidatedOn: '2026-11-06' };
  const other = { act: 'lege-319-2006', consolidatedOn: '2026-11-10' };

  it('refuses a change without a date', () => {
    expect(() => manifestEntrySchema.parse(entry([{ act: 'oug-195-2002' }]))).toThrow();
    expect(() => manifestEntrySchema.parse(entry([]))).toThrow();
  });

  it('passes every change to the database', async () => {
    const { db, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json([{ template_version_id: 'a', version: 2, created: true }])
      );
    const parsed = manifestEntrySchema.parse(entry([change, other]));
    await registerTemplates(db, [{ ...template, kind: 'legal', resolves: parsed.change.resolves }]);
    const [, rpcInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(rpcInit?.body))).toMatchObject({
      p_kind: 'legal',
      p_resolves: [change, other],
    });
  });
});

describe('the manifest of the document engine', () => {
  it('matches what the registration reads, with keys the database accepts', () => {
    const entries = manifestEntries().map((entry) => manifestEntrySchema.parse(entry));
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.typeKey)).size).toBe(entries.length);
  });
});
