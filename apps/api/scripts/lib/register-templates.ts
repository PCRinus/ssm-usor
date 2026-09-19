import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../src/database.types';

// Safe to run again: a file already in Storage stays, and a hash already registered is the
// version it was; only a changed file becomes a new version.

export const templatesBucket = 'document-templates';
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const manifestSchema = z.object({
  templates: z.array(
    z.object({
      number: z.string(),
      typeKey: z.string().regex(/^[a-z][a-z0-9_]{1,59}$/),
      title: z.string().min(2).max(200),
      file: z.string().endsWith('.docx'),
      // Laid out, but its content is still one client's: not offered for generation yet.
      contentPending: z.boolean().optional(),
    })
  ),
});

export type TemplateFile = { typeKey: string; title: string; bytes: Uint8Array };

export function builtInTemplatePath(typeKey: string, sha256: string) {
  return `built-in/${typeKey}/${sha256}.docx`;
}

export async function registerTemplates(db: SupabaseClient<Database>, templates: TemplateFile[]) {
  const results = [];
  for (const template of templates) {
    const sha256 = createHash('sha256').update(template.bytes).digest('hex');
    const path = builtInTemplatePath(template.typeKey, sha256);
    // The file first, so a registered version always has one. The path holds the hash, so a
    // file that is already there is this file, and is not sent again.
    const existing = await db.storage.from(templatesBucket).exists(path);
    if (!existing.data) {
      const upload = await db.storage
        .from(templatesBucket)
        .upload(path, template.bytes, { contentType: docxType, upsert: false });
      // Another run got there first.
      if (upload.error && !isAlreadyThere(upload.error)) {
        throw new Error(`Could not upload ${template.typeKey}: ${upload.error.message}`);
      }
    }
    const registered = await db.rpc('register_built_in_template_version', {
      p_type_key: template.typeKey,
      p_title: template.title,
      p_storage_path: path,
      p_sha256: sha256,
    });
    const row = registered.data?.[0];
    if (registered.error || !row) {
      throw new Error(
        `Could not register ${template.typeKey}: ${registered.error?.message ?? 'no version returned'}`
      );
    }
    results.push({ typeKey: template.typeKey, version: row.version, created: row.created });
  }
  return results;
}

function isAlreadyThere(error: { message: string; statusCode?: string }) {
  return error.statusCode === '409' || /already exists/i.test(error.message);
}
