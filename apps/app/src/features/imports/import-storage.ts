import { supabase } from '@/lib/supabase';

// The bucket's policy takes the object only under the path the API registered, from the member's
// own session, while the file is uploading (ADR 030): the API never carries the bytes.
export async function uploadImportObject(storagePath: string, file: Blob, contentType: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.storage
    .from('imports')
    .upload(storagePath, file, { contentType, upsert: false });
  if (error) throw error;
}

export async function sha256Of(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
