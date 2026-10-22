-- The material a knowledge test closes, shown in the portal beside the study card (ADR 024): the
-- client's issued revision of the general training material (2.2) for occupational safety and
-- of the fire-safety own instructions for fire safety, the two type keys of the contracts'
-- `portalMaterialTypeKeys`. A participant reads no document row, so this answers the one row
-- and the API streams its PDF with the secret key, from the path this function gave for the
-- caller's own participation. The real signed-in user, as in the other participant functions.
create function public.portal_material(p_participant_id uuid, p_domain public.training_domain)
returns table (revision_id uuid, title text, pdf_path text, issued_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, d.title, r.pdf_path, r.issued_at
  from public.client_participants p
  join public.client_documents d on d.client_id = p.client_id
  join public.document_revisions r on r.document_id = d.id
  where p.id = p_participant_id
    and p.user_id = auth.uid()
    and p.revoked_at is null
    and d.type_key = case p_domain
      when 'ssm' then 'general_training_material'
      else 'fire_own_instructions'
    end
    and r.status = 'issued'
    and r.pdf_path is not null
  order by r.issued_at desc, r.revision desc
  limit 1;
$$;

revoke all on function public.portal_material(uuid, public.training_domain) from public, anon;
grant execute on function public.portal_material(uuid, public.training_domain) to authenticated, service_role;
