import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { z } from 'zod';

import type { Database } from '../database.types';
import { supabaseConfigOf, timedFetch } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Every file the API touches goes through here, so where files live stays one decision
// (ADR 005: Supabase Storage today, anything that speaks S3 tomorrow). The client acts as the
// verified user: the policies on storage.objects are the authorization layer.

const templatesBucket = 'document-templates';
const documentsBucket = 'documents';
const modulesBucket = 'instruction-modules';
const clientFilesBucket = 'client-files';
const billingInvoicesBucket = 'billing-invoices';
const importsBucket = 'imports';
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function createFileStore(c: Context<ApiEnv>) {
  const config = supabaseConfigOf(c.env);
  return fileStore(
    c.env,
    c.req.raw.signal,
    config.SUPABASE_PUBLISHABLE_KEY,
    `Bearer ${c.get('accessToken')}`
  );
}

const secretKeySchema = z.string().startsWith('sb_secret_').min(16);

// The policies do not apply to the secret key: for the return link, where nobody is signed
// in, and where every path comes from the token's own send; for the queue consumer, where
// every path comes from a document of the job's own organization.
export function createAdminFileStore(c: Context<ApiEnv>) {
  return adminFileStore(c.env, c.req.raw.signal);
}

export function adminFileStore(env: ApiEnv['Bindings'], signal?: AbortSignal) {
  const secretKey = secretKeySchema.safeParse(env.SUPABASE_SECRET_KEY);
  if (!secretKey.success) throw new ApiError('service_unavailable');
  return fileStore(env, signal, secretKey.data, `Bearer ${secretKey.data}`);
}

function fileStore(
  env: ApiEnv['Bindings'],
  signal: AbortSignal | undefined,
  key: string,
  authorization: string
) {
  const config = supabaseConfigOf(env);
  const storage = createClient<Database>(config.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: authorization },
      // Files are larger than rows: the biggest template is about a megabyte.
      fetch: timedFetch(20_000, signal),
    },
  }).storage;

  const fetchFile = timedFetch(20_000, signal);

  // Not `download()`: that reads the object by its path, and the CDN in front of Storage
  // keeps such a read for up to an hour, invalidating it up to a minute after the object
  // changes (https://supabase.com/docs/guides/storage/cdn/smart-cdn). A draft is read back
  // seconds after the editor saved it, and issuing from the previous bytes once locked a
  // contract with old prices. A signed URL is new every time, so it is never in that cache.
  async function read(bucket: string, path: string, context: string) {
    const { data, error } = await storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) throw fileError(context, error);
    const response = await fetchFile(data.signedUrl);
    if (!response.ok)
      throw fileError(context, { message: `signed read answered ${response.status}` });
    return new Uint8Array(await response.arrayBuffer());
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

    async documentLink(path: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(documentsBucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw fileError('sign document link', error);
      return data.signedUrl;
    },

    readModule: (path: string) => read(modulesBucket, path, 'read instruction module'),

    /** The version row must exist first, the policy checks it; a version is never replaced. */
    async writeModule(path: string, bytes: Uint8Array) {
      const { error } = await storage
        .from(modulesBucket)
        .upload(path, bytes, { contentType: docxType, upsert: false });
      if (error) throw fileError('write instruction module', error);
    },

    async moduleLink(path: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(modulesBucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw fileError('sign instruction module link', error);
      return data.signedUrl;
    },

    /** The row must exist first, the policy checks it; a client file is never replaced. */
    async writeClientFile(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await storage
        .from(clientFilesBucket)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) throw fileError('write client file', error);
    },

    /** Before the row is deleted: the policy follows it. */
    async removeClientFile(path: string) {
      const { error } = await storage.from(clientFilesBucket).remove([path]);
      if (error) throw fileError('remove client file', error);
    },

    async clientFileLink(path: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(clientFilesBucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw fileError('sign client file link', error);
      return data.signedUrl;
    },

    /** The bucket has no policies: only the secret key's store reaches it. */
    async writeBillingInvoice(path: string, bytes: Uint8Array) {
      const { error } = await storage
        .from(billingInvoicesBucket)
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (error) throw fileError('write billing invoice', error);
    },

    async billingInvoiceLink(path: string, fileName: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(billingInvoicesBucket)
        .createSignedUrl(path, expiresInSeconds, { download: fileName });
      if (error || !data) throw fileError('sign billing invoice link', error);
      return data.signedUrl;
    },

    readImportObject: (path: string) => read(importsBucket, path, 'read import object'),

    /** The import's text and converted files, which only the secret key writes. */
    async writeImportObject(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await storage
        .from(importsBucket)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw fileError('write import object', error);
    },

    async createImportObject(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await storage
        .from(importsBucket)
        .upload(path, bytes, { contentType, upsert: false });
      if (error && alreadyExists(error)) return false;
      if (error) throw fileError('create import object', error);
      return true;
    },

    async importObjectLink(path: string, expiresInSeconds = 60) {
      const { data, error } = await storage
        .from(importsBucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw fileError('sign import object link', error);
      return data.signedUrl;
    },

    async listImportFolder(folder: string) {
      const objects: { name: string; size: number | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await storage
          .from(importsBucket)
          .list(folder, { limit: 1000, offset });
        if (error || !data) throw fileError('list import folder', error);
        for (const object of data) {
          const size = (object.metadata as { size?: unknown } | null)?.size;
          objects.push({ name: object.name, size: typeof size === 'number' ? size : null });
        }
        if (data.length < 1000) return objects;
      }
    },

    /** An object already at the target counts as copied, so an interrupted copy can resume. */
    async copyImportObject(from: string, to: string, bucket: 'imports' | 'client-files') {
      const { error } = await storage
        .from(importsBucket)
        .copy(from, to, { destinationBucket: bucket });
      if (error && !alreadyExists(error)) throw fileError('copy import object', error);
    },

    async copyClientFileToImports(from: string, to: string) {
      const { error } = await storage
        .from(clientFilesBucket)
        .copy(from, to, { destinationBucket: importsBucket });
      if (error && !alreadyExists(error)) throw fileError('copy client file to imports', error);
    },

    async removeImportObjects(paths: string[]) {
      for (let start = 0; start < paths.length; start += 100) {
        const { error } = await storage.from(importsBucket).remove(paths.slice(start, start + 100));
        if (error) throw fileError('remove import objects', error);
      }
    },

    async removeClientObjects(bucket: ClientObjectBucket, paths: string[]) {
      for (let start = 0; start < paths.length; start += 100) {
        const { error } = await storage.from(bucket).remove(paths.slice(start, start + 100));
        if (error) throw fileError('remove client objects', error);
      }
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;

export const clientObjectBuckets = [documentsBucket, clientFilesBucket, importsBucket] as const;
export type ClientObjectBucket = (typeof clientObjectBuckets)[number];

// Storage answers a duplicate with HTTP 400 and the status 409 in its body.
function alreadyExists(error: { message?: string; status?: unknown; statusCode?: unknown }) {
  return (
    error.status === 409 ||
    error.statusCode === '409' ||
    error.statusCode === 409 ||
    /already exists/i.test(error.message ?? '')
  );
}

function fileError(context: string, error: { message?: string } | null) {
  console.error(`Storage request failed (${context}): ${error?.message ?? 'no data'}`);
  return new ApiError('service_unavailable', 'The file storage is temporarily unavailable.');
}
