import { type ActText, type ActUnit, fetchActText, plainLabel } from './act-text';
import type { PortalOptions } from './portal';
import type { StoredArticleAnchor } from './stored';

// One entry per article and per annex of the act's form, an annex's own articles under its label.
export type ArticleAnchor = StoredArticleAnchor;

export type ActAnchors = {
  // Null for the act as published, never consolidated.
  consolidatedOn: string | null;
  anchors: ArticleAnchor[];
};

export function articleAnchors(text: ActText): ArticleAnchor[] {
  const found: ArticleAnchor[] = [];
  const walk = (units: (string | ActUnit)[], annex: string | null) => {
    for (const unit of units) {
      if (typeof unit === 'string') continue;
      if (unit.anchor && (unit.kind === 'article' || unit.kind === 'annex')) {
        found.push({
          annex: unit.kind === 'annex' ? unit.label : annex,
          article: unit.kind === 'article' ? plainLabel(unit.label) : null,
          path: unit.anchor.path,
          anchor: unit.anchor.id,
        });
      }
      walk(unit.content, unit.kind === 'annex' ? unit.label : annex);
    }
  };
  walk(text.content, null);
  return found;
}

export type AnchorReader = (portalId: number) => Promise<ActAnchors>;

export function portalAnchorReader(options: PortalOptions = {}): AnchorReader {
  return async (portalId) => {
    const fetched = await fetchActText(portalId, options);
    return { consolidatedOn: fetched.consolidatedOn, anchors: articleAnchors(fetched.text) };
  };
}
