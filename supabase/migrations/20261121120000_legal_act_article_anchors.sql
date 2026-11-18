-- Where each article of a watched act stands on the Portal Legislativ, so that a test question's
-- citation links to the article (ADR 024, ADR 017). The daily check reads them from the form it
-- last saw and reads them again when a newer form appears: the portal renumbers its element ids
-- from one consolidated form to the next. The members' policy on legal_acts covers the columns.

alter table public.legal_acts
  -- [{ "annex": "Anexa" | "2" | null, "article": "23" | "80^1" | null,
  --    "path": "/Public/DetaliiDocument/73772", "anchor": "id_artA294" }], one per article and
  -- per annex; `path` is the portal page that holds the unit, which for norms an act approves is
  -- a document of its own.
  add column article_anchors jsonb
    constraint legal_acts_article_anchors_array check (jsonb_typeof(article_anchors) = 'array'),
  -- The form the anchors were read from; null for an act never consolidated.
  add column anchors_consolidated_on date,
  add column anchors_read_at timestamptz,
  add constraint legal_acts_anchors_read check ((article_anchors is null) = (anchors_read_at is null));
