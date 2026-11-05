import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../../src/database.types';
import type { AdminClient } from '../../../src/lib/admin-db';
import { fromDatabaseError } from '../../../src/lib/db';
import { importStore } from '../../../src/modules/imports/store';
import type { CopySource, KeptCopy } from './cases';
import type { CaseContext } from './reading';

const bucket = 'import-copies';
const pageSize = 1000;

// The bucket has no Storage policy: only the secret key reads it (ADR 037).
export function secretClient(url: string, secret: string): AdminClient {
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function storageCopies(admin: AdminClient): CopySource {
  return {
    async list(filter) {
      const copies: KeptCopy[] = [];
      for (let from = 0; ; from += pageSize) {
        let query = admin
          .from('import_copies')
          .select('organization_id, import_id, part')
          .is('removed_at', null);
        if (filter.imports.length > 0) query = query.in('import_id', filter.imports);
        if (filter.organization) query = query.eq('organization_id', filter.organization);
        const { data, error } = await query
          .order('written_at', { ascending: false })
          .order('id')
          .range(from, from + pageSize - 1);
        if (error) throw fromDatabaseError(error, 'list import copies');
        copies.push(
          ...data.map((row) => ({
            organizationId: row.organization_id,
            importId: row.import_id,
            part: row.part,
          }))
        );
        if (data.length < pageSize) return copies;
      }
    },
    async read(path) {
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (error) throw new Error(`The copy's object ${path} could not be read: ${error.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function databaseContext(admin: AdminClient): CaseContext {
  const store = importStore(admin);
  return {
    client: (clientId) => store.client(clientId),
    trainingThemes: (row, today) => store.trainingThemes(row, today),
  };
}
