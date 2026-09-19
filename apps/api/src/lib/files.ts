import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

import type { Database } from '../database.types';
import { requestFetch, supabaseConfig } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Every file the API touches goes through here, so where files live stays one decision
// (ADR 005: Supabase Storage today, anything that speaks S3 tomorrow). The client acts as the
// verified user: the policies on storage.objects are the authorization layer.

const templatesBucket = 'document-templates';
const documentsBucket = 'documents';
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function createFileStore(c: Context<ApiEnv>) {
  const config = supabaseConfig(c);
  const storage = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${c.get('accessToken')}` },
      // Files are larger than rows: the biggest template is about a megabyte.
      fetch: requestFetch(c, 20_000),
    },
  }).storage;

  async function read(bucket: string, path: string, context: string) {
    const { data, error } = await storage.from(bucket).download(path);
    if (error || !data) throw fileError(context, error);
    return new Uint8Array(await data.arrayBuffer());
  }

  return {
    readTemplate: (path: string) => read(templatesBucket, path, 'read template'),
    readDocument: (path: string) => read(documentsBucket, path, 'read document'),

    /** The row must exist first, the policies check it. */
    async writeDocument(path: string, bytes: Uint8Array, options: { replace: boolean }) {
      const { error } = await storage.from(documentsBucket).upload(path, bytes, {
        contentType: path.endsWith('.pdf') ? 'application/pdf' : docxType,
        upsert: options.replace,
      });
      if (error) throw fileError('write document', error);
    },

    async removeDocument(path: string) {
      const { error } = await storage.from(documentsBucket).remove([path]);
      if (error) throw fileError('remove document', error);
    },

    async documentLink(path: string, fileName: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(documentsBucket)
        .createSignedUrl(path, expiresInSeconds, { download: fileName });
      if (error || !data) throw fileError('sign document link', error);
      return data.signedUrl;
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;

function fileError(context: string, error: { message?: string } | null) {
  console.error(`Storage request failed (${context}): ${error?.message ?? 'no data'}`);
  return new ApiError('service_unavailable', 'The file storage is temporarily unavailable.');
}
