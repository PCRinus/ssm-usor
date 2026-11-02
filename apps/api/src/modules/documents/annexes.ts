import type { InstructionBody, InstructionDomain } from '@ssm-usor/contracts';
import { appendAnnexes, renderAnnex, TemplateError } from '@ssm-usor/document-engine';

import type { Json } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { annexDomainOf, annexesData } from './snapshot';

export function renderInstructionAnnex(
  domain: InstructionDomain,
  body: InstructionBody,
  data: Record<string, unknown>
) {
  try {
    return renderAnnex(domain, body, data);
  } catch (error) {
    if (error instanceof TemplateError) {
      console.error(`The ${domain} annex could not be merged: ${error.message}`);
      throw new ApiError('internal_error', 'An annex could not be filled in.');
    }
    throw error;
  }
}

async function annexedBodies(db: DataClient, versionIds: string[]) {
  const { data, error } = await db
    .from('instruction_module_versions')
    .select('id, body')
    .in('id', versionIds);
  if (error) throw fromDatabaseError(error, 'read annexed module versions');
  return new Map(data.map((row) => [row.id, row.body as InstructionBody]));
}

// A version that is gone was a test module deleted with the move to bodies (ADR 034): a draft
// that annexed one is generated again before it is issued.
export async function renderSnapshotAnnexes(
  db: DataClient,
  typeKey: string,
  snapshot: Json | null,
  only?: { number: number }
): Promise<Uint8Array[]> {
  const domain = annexDomainOf(typeKey);
  const annexes = (domain ? annexesData(snapshot) : []).filter(
    (annex) => !only || annex.data.number === only.number
  );
  if (!domain || annexes.length === 0) return [];
  const bodies = await annexedBodies(
    db,
    annexes.map((annex) => annex.versionId)
  );
  return annexes.map((annex) => {
    const body = bodies.get(annex.versionId);
    if (!body) {
      throw new ApiError(
        'conflict',
        'An annexed instruction is no longer in the library; generate the document again.',
        undefined,
        'annex_not_in_library'
      );
    }
    return renderInstructionAnnex(domain, body, annex.data);
  });
}

// Only for what is downloaded: the draft in the editor stays the common part alone, or a
// client's edit would change a module's text for one binder (ADR 034).
export async function withAnnexes(
  db: DataClient,
  typeKey: string,
  snapshot: Json | null,
  common: Uint8Array
) {
  const annexes = await renderSnapshotAnnexes(db, typeKey, snapshot);
  return annexes.length > 0 ? appendAnnexes(common, annexes) : common;
}
