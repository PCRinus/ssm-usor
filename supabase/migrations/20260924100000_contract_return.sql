-- ADR 007, amended: the return link. A send carries a token, hashed here, that lets the
-- recipient upload the signed copy without an account; what arrives is a received copy,
-- which an owner confirms.

alter table public.service_contract_sends
  add column token_hash text
    constraint service_contract_sends_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  add column return_expires_at timestamptz,
  -- Uploads through the link, bounded: the token is the only gate.
  add column return_uploads smallint not null default 0
    constraint service_contract_sends_return_uploads_range check (return_uploads between 0 and 20);

create unique index service_contract_sends_token_hash_key
  on public.service_contract_sends (token_hash);

comment on column public.service_contract_sends.token_hash is 'SHA-256 of the token in the return link; null for a send made before there were return links.';

-- An owner reads the hash of their own sends, which lets them mint nothing they could not
-- already do: the link only uploads a copy to a contract they attach copies to themselves.
-- The counter and the expiry are written by the secret key alone; sends stay immutable to
-- members.

alter table public.document_signed_copies
  add column source text not null default 'owner'
    constraint document_signed_copies_source_check check (source in ('owner', 'client')),
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references auth.users (id) on delete set null;

-- What an owner attached was looked at by that owner: confirmed on the spot.
update public.document_signed_copies
  set confirmed_at = uploaded_at, confirmed_by = uploaded_by
  where confirmed_at is null;

alter table public.document_signed_copies
  add constraint document_signed_copies_owner_copies_confirmed
    check (source = 'client' or confirmed_at is not null);

comment on column public.document_signed_copies.source is 'owner: attached in the app; client: received through the return link.';
comment on column public.document_signed_copies.confirmed_at is 'When an owner confirmed the copy. Null for a received copy nobody has looked at; a contract is signed only by a confirmed copy.';
