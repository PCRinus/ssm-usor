-- The account an invitation's address already has (ADR 022). The Auth Admin API finds no user
-- by phone, its list filter reading the email and the name only, and an invitation sent by SMS
-- must find the account behind a phone to mark it as a participant's. Auth stores a phone
-- without its plus sign. For the API's secret key only: the answer says whether an address has
-- an account, which no member may learn (ADR 003).
create function public.auth_user_id_by_address(p_channel text, p_address text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where case p_channel
    when 'email' then lower(u.email) = lower(btrim(p_address))
    when 'sms' then u.phone = ltrim(btrim(p_address), '+')
    else false
  end
  order by u.created_at
  limit 1;
$$;

revoke all on function public.auth_user_id_by_address(text, text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_address(text, text) to service_role;
