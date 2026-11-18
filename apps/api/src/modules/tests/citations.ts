import {
  anchorOf,
  type ArticleAnchor,
  articleAnchorSchema,
  type CitationPart,
  type CitationReference,
  parseCitation,
} from '@ssm-usor/contracts';
import { legalActs } from '@ssm-usor/document-engine/citations';
import { z } from 'zod';

import { type DataClient, fromDatabaseError } from '../../lib/db';

const portalOrigin = 'https://legislatie.just.ro';

let watched: Map<string, number> | undefined;

const portalIds = () =>
  (watched ??= new Map(
    legalActs().flatMap((act) => (act.portalId === null ? [] : [[act.id, act.portalId] as const]))
  ));

export const citationReferences = (citation: string | null): CitationReference[] =>
  citation === null ? [] : parseCitation(citation, (act) => portalIds().has(act));

const storedAnchors = z.array(articleAnchorSchema);

async function anchorsOf(db: DataClient, actIds: string[]) {
  if (actIds.length === 0) return new Map<string, ArticleAnchor[]>();
  const { data, error } = await db
    .from('legal_acts')
    .select('id, article_anchors')
    .in('id', actIds);
  if (error) throw fromDatabaseError(error, 'legal act anchors');
  return new Map(
    data.map((row) => {
      const anchors = storedAnchors.safeParse(row.article_anchors ?? []);
      return [row.id, anchors.success ? anchors.data : []];
    })
  );
}

export function linkCitation(
  references: CitationReference[],
  anchors: ReadonlyMap<string, readonly ArticleAnchor[]>
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
