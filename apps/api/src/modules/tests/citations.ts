import {
  anchorOf,
  type CitationPart,
  type CitationReference,
  parseCitation,
} from '@ssm-usor/contracts';
import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  type StoredArticleAnchor,
  storedArticleAnchorsSchema,
} from '@ssm-usor/legislation-check/stored';

import type { DataClient } from '../../lib/db';

const portalOrigin = 'https://legislatie.just.ro';

let watched: Map<string, number> | undefined;

const portalIds = () =>
  (watched ??= new Map(
    legalActs().flatMap((act) => (act.portalId === null ? [] : [[act.id, act.portalId] as const]))
  ));

export const citationReferences = (citation: string | null): CitationReference[] =>
  citation === null ? [] : parseCitation(citation, (act) => portalIds().has(act));

// Links are a convenience: without the anchors every article links to its act, and a question
// already written, or the bank, still answers rather than failing on them.
async function readAnchorRows(db: DataClient, actIds: string[]) {
  try {
    const { data, error } = await db
      .from('legal_acts')
      .select('id, article_anchors, anchors_consolidated_on, last_consolidated_on')
      .in('id', actIds);
    if (!error) return data;
    console.error(
      `Legal act anchors not read, citations link to their acts: ${error.code || 'no code'}`
    );
  } catch (error) {
    console.error(
      `Legal act anchors not read, citations link to their acts: ${error instanceof Error ? error.name : 'unknown'}`
    );
  }
  return [];
}

async function anchorsOf(db: DataClient, actIds: string[]) {
  if (actIds.length === 0) return new Map<string, StoredArticleAnchor[]>();
  const data = await readAnchorRows(db, actIds);
  return new Map(
    // Anchors of an older form than the portal shows point at renumbered articles until the
    // check reads them again; the act's page is the safer link meanwhile.
    data.map((row) => [
      row.id,
      row.anchors_consolidated_on === row.last_consolidated_on
        ? storedArticleAnchorsSchema.parse(row.article_anchors)
        : [],
    ])
  );
}

export function linkCitation(
  references: CitationReference[],
  anchors: ReadonlyMap<string, readonly StoredArticleAnchor[]>
): CitationPart[] {
  return references.map((reference) => {
    const portalId = reference.act === null ? undefined : portalIds().get(reference.act);
    if (portalId === undefined) return { ...reference, url: null, target: null };
    const anchor =
      reference.article === null && reference.annex === null
        ? null
        : anchorOf(anchors.get(reference.act!) ?? [], reference);
    if (!anchor) {
      return {
        ...reference,
        url: `${portalOrigin}/Public/DetaliiDocument/${portalId}`,
        target: 'act',
      };
    }
    return {
      ...reference,
      url: `${portalOrigin}${anchor.path}#${anchor.anchor}`,
      target: reference.article === null ? 'annex' : 'article',
    };
  });
}

export async function citationLinker(db: DataClient, citations: (string | null)[]) {
  const references = new Map(
    [...new Set(citations)].map((citation) => [citation, citationReferences(citation)])
  );
  const actIds = new Set(
    [...references.values()].flat().flatMap((reference) => (reference.act ? [reference.act] : []))
  );
  const anchors = await anchorsOf(db, [...actIds]);
  return (citation: string | null) => linkCitation(references.get(citation) ?? [], anchors);
}
