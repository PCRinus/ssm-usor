-- ADR 024: no law asks for the periodic occupational safety test (5.2, TPSSM), so it leaves the
-- set. The files in Storage stay; nothing reads them once their rows are gone.

delete from public.regeneration_jobs where type_key = 'test_periodic';

delete from public.document_signed_copies s
using public.client_documents d
where d.id = s.document_id and d.type_key = 'test_periodic';

delete from public.document_revisions r
using public.client_documents d
where d.id = r.document_id and d.type_key = 'test_periodic';

delete from public.client_documents where type_key = 'test_periodic';

delete from public.document_template_versions v
using public.document_templates t
where t.id = v.template_id and t.type_key = 'test_periodic';

delete from public.document_templates where type_key = 'test_periodic';
