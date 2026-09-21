-- ADR 007: what a service contract prints about the provider and the documentation set does
-- not. All optional; only generating a contract asks for them.

alter table public.organizations
  add column phone text
    constraint organizations_phone_length check (char_length(btrim(phone)) between 5 and 20),
  -- Without spaces, upper case. The API validates the check digits.
  add column iban text
    constraint organizations_iban_format check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  add column bank_name text
    constraint organizations_bank_name_length check (char_length(btrim(bank_name)) between 2 and 120),
  -- The "certificat de abilitare" of an external prevention and protection service
  -- (Legea 319/2006, H.G. 1425/2006), which the contract cites and annexes.
  add column authorization_certificate_number text
    constraint organizations_authorization_certificate_number_length
    check (char_length(btrim(authorization_certificate_number)) between 1 and 40),
  add column authorization_certificate_date date,
  add column authorization_certificate_issuer text
    constraint organizations_authorization_certificate_issuer_length
    check (char_length(btrim(authorization_certificate_issuer)) between 2 and 200),
  -- Decides the sentence about VAT beside the prices of a contract.
  add column vat_payer boolean not null default false,
  -- Text, not a member: the person may not use the app. Printed only when fire safety is sold.
  add column fire_safety_technician_name text
    constraint organizations_fire_safety_technician_name_length
    check (char_length(btrim(fire_safety_technician_name)) between 2 and 160),
  add column fire_safety_technician_certificate text
    constraint organizations_fire_safety_technician_certificate_length
    check (char_length(btrim(fire_safety_technician_certificate)) between 1 and 80);

-- The update policy is the owners'; the columns a member may write are listed one by one.
grant update (
  phone, iban, bank_name,
  authorization_certificate_number, authorization_certificate_date, authorization_certificate_issuer,
  vat_payer, fire_safety_technician_name, fire_safety_technician_certificate
) on table public.organizations to authenticated;
