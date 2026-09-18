# ADR 003: Organization Invitations and Member Accounts

- Status: accepted
- Date: 2026-09-18

## Context

Public signup is disabled and the only way to create an account or a membership is the seed script. An organization therefore cannot grow beyond the user it was seeded with. ADR 002 planned organization invitations as its fourth step and already decided they need a table of our own, because Supabase's invitation call rejects people who already have an account.

Three gaps surface with the first invited person. The `owner` role exists but nothing checks it. The app knows a user only by email, so neither an invitation email nor a members list can name anyone. And the SPA never learns which organization the signed-in user belongs to.

Every user belongs to at most one organization, and that stays. Membership of several organizations was considered and dropped: the need behind it was platform support looking into a customer's organization, which impersonation already covers. How a new organization and its first owner come to exist belongs to the future signup journey and is out of scope here.

## Decision

### Who invites

Only an `owner` invites, resends, and revokes. The owner picks the invitee's role, `specialist` by default or `owner`. This is the first role check in the system. It is enforced in the database through a `public.is_organization_owner()` helper, and the API repeats it to answer with a clear `403`.

Owner routes act for a signed-in user, so they use the per-user client. Owners read invitations under row-level security and write them through `security definer` functions that carry the checks: the role, the membership test against `auth.users`, and the limits. The per-user client never writes a token hash. A browser holds the same credentials as that client, so an owner allowed to write a hash could mint a link of their own. The API sets the hash with the admin client once the owner's call has succeeded.

### Invitation records

An `organization_invitations` table holds the organization, the invited email (trimmed and lowercased), the role, who invited, a token hash, `expires_at`, `accepted_at`, and `revoked_at`. Status is derived from those columns, never stored.

- Tokens follow the waitlist: 32 random bytes in the link, only the SHA-256 hash in the database. Resending issues a fresh token, which invalidates the earlier link.
- An invitation expires after 7 days. An organization holds at most one open invitation per email; inviting that email again renews the row. Resends are limited to one per 10 minutes, and an organization may have 20 open invitations.
- Inviting someone who is already a member of the same organization is refused. Every other case gets the same response, so an owner never learns whether an address has an account or belongs to another organization.
- The API never returns the link. The token is proof that the invitee controls the mailbox; an owner holding the link could create a confirmed account for an address that is not theirs.
- During an impersonation `invited_by` records the platform admin's real user id, as `created_by` does on clients.

### The email and its link

The mail Worker gains `sendOrganizationInvitation`, carrying the recipient, the link, the organization name, and the inviter's name. One template serves people with and without an account, so its action reads "Acceptă invitația".

The link opens the SPA at `/accept-invitation?token=…`, built from a new `APP_ORIGIN` variable in `apps/api`. Opening it changes nothing: the page posts the token to a public lookup endpoint that returns the organization name, the invited email, the invitation's state, and whether an account exists for that email. Acceptance is a separate `POST`. A mail scanner that prefetches links therefore cannot accept an invitation. The token travels in request bodies and never in an API URL.

### Accepting

Public signup stays disabled. What happens depends on the invited email:

- **No account.** The page asks for a full name and a password that meets the Supabase password policy. The API creates the user through the Auth Admin API with `email_confirm: true`, then calls one SQL function that, in a single transaction, locks the invitation, checks that it is open, inserts the membership and the profile, and marks the invitation accepted. If that function fails, the API deletes the user it just created. The SPA then signs in with the password the person typed, so no session is passed through a URL.
- **An account without a membership.** The page asks the person to sign in, then accept. This path runs as the signed-in user through a `security definer` function that compares the invitation's email with the confirmed email of the signed-in account, so it needs no admin client. It is also how a failed cleanup of the previous path recovers.
- **An account in another organization.** Acceptance is refused with a message saying so. The primary key on `organization_members` enforces the rule; the function adds no check of its own.
- **Signed in as someone else.** The page names both addresses and offers to sign out.

Accepting twice is safe: the second call finds the invitation accepted and points the person to the login page.

The invitations module uses the admin client for three things only: setting the token hash when an invitation is sent, the public lookup, and the new-account path.

### Profiles

A `profiles` table, keyed by the auth user id, holds `full_name`, `terms_version`, and `terms_accepted_at`. Email stays in `auth.users` and is not copied. Members read the profiles of their own organization and update only their own. The members list comes from a `security definer` function that joins memberships, profiles, and auth emails for the caller's organization.

The accept form shows a notice with links to the terms and the privacy policy instead of a consent checkbox, and records the terms version from a constant in `packages/contracts`. An invited member's data is processed under the organization's contract rather than the member's consent; the version is kept so a material change to the terms can prompt acceptance again. The owner's acceptance of the contract belongs to the signup journey.

`GET /me` grows `profile` and `membership: { organization: { id, name }, role } | null`. `PATCH /me/profile` backs a "Profilul meu" page where a user edits their name; it creates the profile when an account from before this change has none. The seed gains a name for the development admin.

### In the SPA

- An "Organizație" entry in the navigation opens `/organization`. Every member sees the organization and its members; owners also see open invitations and the invite, resend, and revoke actions. Hiding those actions is cosmetic, the database enforces the rule.
- The account menu shows the user's name, the organization name, and the email, and links to the profile page. A shared `useMe` hook feeds both.
- Sonner, added through shadcn, confirms actions that leave the user on the same page. Errors and field validation stay inline so they persist next to their cause. Existing flows are not changed here.

### Order of work

1. The migration and its pgTAP tests: `profiles`, `organization_invitations`, the owner policies, and the functions above.
2. The contracts and the invitation email.
3. The API: the invitations module, `/me`, `PATCH /me/profile`, and `APP_ORIGIN`.
4. The SPA: `useMe`, the account menu, the organization page, the profile page, and Sonner.
5. The SPA accept page, for a new and an existing account.

Password reset through Supabase's Send Email hook follows as the next piece of work, with changing a password from the profile page. Impersonation routes, removing members, and changing roles come later.

## Consequences

- A new person's password passes through `apps/api` once, on its way to the Auth Admin API. It is never logged or stored. The alternative, a Supabase-generated link, would send Supabase's own email and fail for existing accounts.
- Invitation acceptance replaces email confirmation for invited people. That holds only while the link reaches nobody but the mailbox owner, which is why no endpoint returns it.
- A second module imports the admin client. Review keeps it to the token hash and the two public operations.
- Until password reset ships, an invited person who forgets their password needs help from us.
- An owner invited by mistake can be corrected only in the database until member management exists.
- A person who already belongs to an organization cannot join another. Lifting that later is contained: every policy resolves the organization through `current_organization_id()` and `current_membership()`.
- Sends stay synchronous, as in ADR 002, so an owner invites one person per request.
- Invitation rows keep an invitee's email before that person has any relationship with us. Expired and revoked rows are not purged yet; a retention rule should come with member management.
- `docs/data-model.md`, `docs/api.md`, and `docs/mail.md` change with the pull requests that implement this.
