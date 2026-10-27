# ADR 029: Billing, plans and trials

- Status: proposed
- Date: 2026-10-26, amended 2026-10-27 (our own checkout with the Payment Element instead of Stripe's hosted Checkout, the account settings, the credentials)

## Context

The prices are published at `ssmusor.ro/preturi/` since #606–#608: Start at 39 € and Profesional at 149 € a month without VAT, Enterprise on request, an annual price of ten months (two months free), packs of employees and an extra member as add-ons. The page promises a 30-day trial without a card at launch and says that going over a limit never blocks the work. Sign-up is not public yet ([ADR 004](adr-004-registration-and-onboarding.md)): registration and onboarding are built and live, nothing links to them, and every organization so far came from the seed or from a tester.

Nothing in the app knows about plans, trials or payment. Before the waitlist hears that accounts are open, the app has to start a trial, take payment, issue the Romanian invoice, count usage against the plan, and end an account the way the Terms already promise (30 days to export, then deletion: Termeni point 6, Acordul de prelucrare point 9). Before that, two or three testers start using it for free in exchange for their feedback.

The seller is Mircea's PFA, `Casapu Mircea-Adrian PFA`, VAT-registered, CAEN 6210, which already invoices another client through Oblio and has a euro account at ING. If the product does well, the business moves to an SRL, which will register for VAT.

The decisions below were taken in conversation on 2026-10-25 and 2026-10-26. The prices and lines themselves live in `apps/marketing/src/components/site/pricing.ts`, which is the only place they are written; this ADR does not repeat the numbers that may change.

## Decision

### Plans and the trial

Three plans: **Start**, **Profesional**, **Enterprise**. A plan is about scale and team, never about compliance: every plan has every document, training, test and signature. Enterprise is a quote, sold by email, not a self-serve plan: it never appears in our checkout, and setting it on an organization by hand is left until a first Enterprise client exists.

Every new organization starts a **trial** of 30 days with Profesional's features, employees (1,500) and members (3), but **without SMS**: sign-in and signing codes go by email, and SMS start when a plan is chosen. A free account that can send SMS invites SMS pumping, and an allowance that jumps from a trial's few codes to a plan's hundreds reads oddly. A participant without an email cannot be invited during a trial; the invitation says why and what to do. No card is asked for. The trial lives in our database; Stripe knows nothing of an organization until it picks a plan.

An organization that picks a plan before its trial ends keeps the days left: the card is saved at once, and the first charge, with the first invoice, falls on the day the trial would have ended (the Stripe subscription is created with that `trial_end`). Deciding early costs nothing, so nobody has a reason to wait. SMS start when the plan is chosen, since a saved card is the guard the trial lacked. Until the trial's end the organization keeps the trial's limits (Profesional's), then the plan's apply. From the moment of choosing, the plan badge shows the plan's name and the trial bar no longer shows. Cancelling before the first charge returns it to a trial without a plan, and nothing is charged.

When the trial ends without a plan, the organization becomes **read-only** (below). The pricing page's FAQ says today that without a plan the documents stay viewable and downloadable with no end; it changes to say 30 days.

### Access: full, read-only, deleted

An organization's **access** is derived from timestamps, not set by a job:

- **full** while nothing has ended: during a trial, while a subscription is paid or retrying a failed payment, and for an organization with no subscription row at all;
- **read-only** for 30 days after full access ends: members and participants see and download everything, nobody changes anything, and the export ("Exportă tot") works;
- **deleted** after those 30 days, by a scheduled job that removes the organization and everything under it, as the Terms promise. Backups roll over in their own cycle.

Full access ends when a trial ends without a plan, at the end of the period already paid after a cancellation, or 14 days after the first failed renewal if Stripe's retries have not succeeded by then. Subscribing again while read-only restores full access with everything as it was.

An organization without a subscription row has full access indefinitely. That covers the seeded organizations, the end-to-end test accounts on both environments, and every organization created before this ADR, so nothing needs backfilling. Only onboarding and checkout create rows.

Read-only is enforced by the API: a member's request that changes something (`POST`, `PUT`, `PATCH`, `DELETE`) answers `403` with the reason `read_only` unless the route is on a short allowlist. The allowlist holds requests that only read or only take access away:

- printing a document's unsaved edits;
- removing a member, revoking a member's invitation, revoking a participant or a participant's invitation. An owner must always be able to cut off someone who left, read-only or not;
- the portal's privacy notice and language, without which a participant could not get to what they may still read.

A participant's signing and test attempts answer `403` too. Acknowledging an update is a member's own state and is never checked. Two writes stay open on purpose: accepting an invitation already sent, which gives the person read-only access like everyone else, and a client's upload of the signed service contract through its return link, so a document the provider asked for is not lost. An admin impersonating a member of a read-only organization is read-only too. The database does not enforce it: the publishable key ships in the SPA, so a member who calls the data API directly could still write. That is accepted. It saves a read-only account from nothing it could not do through the export, and a write policy on every table is a large change for a case no honest customer meets.

### Subscriptions in our database

One row per organization in `subscriptions`: the plan, the status (`trialing`, `active`, `past_due`, `canceled`), the end of the trial, the end of full access (`access_until`, null while nothing is due to end), and later the Stripe customer and subscription ids, the billing interval, the price version, the quantities of packs and members, the Stripe account the subscription belongs to, and an optional email for invoices. Every change to a row is also written to `subscription_changes` with who made it (onboarding, Stripe, a workflow, later an admin), what changed and why.

Members of the organization may read their row; nobody writes it except through security-definer functions and the service key. `GET /me` carries the access, the plan, the status and the dates, so the app knows without a separate request.

### Stripe takes the payment

Stripe Billing on Mircea's PFA account (individual / sole proprietor, Romania). Decided in the account setup on 2026-10-26: euro payouts to the ING euro account, automatic and monthly; Radar Lite; no Stripe Tax; no Managed Payments (Stripe as merchant of record costs 3.5 % more, bills from abroad and would push clients without a VAT code into registering for one); no climate contribution; statement descriptor `SSMUSOR.RO`, shortened `SSM USOR`.

- **Products and prices are code.** A setup script creates them through the API in both environments: the plans monthly and annually, the packs and the extra member (on an annual plan these too cost ten months a year: 150 €, 400 €, 150 €), the metered SMS price (monthly on every plan), a fixed tax rate of 21 % added to the price, the customer portal configuration, the app's domains for Apple Pay, and the webhook endpoint's list of events. Non-prod uses a Stripe sandbox (not the older test mode, which shares settings with the live account), production the live account. A price change is a pull request.
- **The checkout is ours, with Stripe's Payment Element**, on a new **Abonament** tab of the organization pages (next to Echipă, Date firmă, Abilitări; Setări is a member's personal page, the subscription is the organization's) in our own design system: the plan, the interval and the packs are chosen on our page, the card form is Stripe's iframe inside it, and the first payment is confirmed in the browser, 3D Secure included. Card data never touches our servers, so our card-security obligations stay as light as with a hosted page. The customer is created when a plan is picked, with the organization's company details, which onboarding took from ANAF and the owner confirmed. Card, Apple Pay and Google Pay are offered; Stripe's Link is off. Bank transfer can come later, for annual and Enterprise clients, invoiced by hand. Only the owner chooses, changes or cancels a plan. The other members see the tab too: the plan, its status, the usage meters and the public list prices, but not the organization's amounts (the next payment, the extra SMS so far, what a change would cost), the card or the invoices; those are the owner's, as the invoices are readable only by the owner. In the checkout the packs cannot go below what the organization's employees need today. After a failed payment, saving a new card retries the open invoice at once; there is no separate "pay now" step. Cancelling asks for a reason, optionally: one choice and a free text.
- **Why not Stripe's hosted Checkout.** Extra SMS are billed monthly, so an annual subscription carries a monthly metered item. Stripe calls that a mixed-interval subscription; it needs flexible billing mode, which is the default for API versions from `2025-09-30.clover` on and is set on both accounts, and hosted Checkout cannot create one. Our own page also keeps the choice of plan and packs in the app instead of a detour to Stripe. The cost is one more pull request: the form, its error states and the 3D Secure step.
- **The customer portal is Stripe's, for the card only.** Its invoice history and its cancel button are off: on a mixed-interval subscription Stripe's cancel-at-period-end stops at the earliest item's end, which is a month into a paid year. Cancelling is our button, which cancels at `max_period_end`. Plan and pack changes are ours too, since the portal cannot change a subscription with several items.
- **Webhooks** (`customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`) update `subscriptions` and trigger the invoice. They are verified with the signing secret and handled idempotently by event id. An invoice of zero, such as an annual client's month without extra SMS, is recorded and goes no further.
- **Stripe's own emails are off**, in both accounts: receipts, invoices, credit notes, renewal and expiring-card reminders, failed payments and the link to confirm a payment. They do not exist in Romanian. The client gets one email per invoice, from Oblio, and our own emails for the rest (below).
- **Failed payments** are retried by Stripe's Smart Retries, up to 8 times within 2 weeks; then Stripe cancels the subscription and marks the invoice uncollectible. A payment waiting for the client's confirmation is cancelled after 15 days. That gives the 14 days of full access the Terms promise, then read-only. These, the emails and the branding (our icon and logo, forest `#18342e`, lime `#b6d86f`) are dashboard settings with no API, set by hand on 2026-10-27.
- **Promotion codes** stay available for public offers later (Stripe's coupons, applied by our checkout); none at launch.
- **Credentials**, per GitHub environment: `STRIPE_SECRET_KEY` (the sandbox key in non-prod; in production a live key limited to "full access except sensitive operations", which cannot pay out or move money), `STRIPE_WEBHOOK_SECRET`, and the variable `VITE_STRIPE_PUBLISHABLE_KEY` for the Payment Element. The webhook endpoint is created once by hand in each dashboard, because Stripe shows its signing secret only at creation and it goes straight to GitHub; the setup script then keeps its event list. Stripe's custom domains are not used: they only rename Stripe's hosted pages.
- **Where the code lives.** The calls to Stripe and Oblio, plan changes and the webhook handler are a `billing` module of the API, next to the database and the member's session; a Worker of its own would add a deployment and a copy of the secrets without isolating anything, since card data never reaches us. The plan picker and the Payment Element live in the app's subscription feature. The plan catalogue (Stripe price keys, limits, allowances) and the request shapes live in `packages/contracts`, read by the API, the app and the setup script. The setup script is an operator script of the API, run from a GitHub workflow so the keys stay in GitHub.

### Oblio issues the invoice

A Stripe invoice is not a Romanian one: it has Stripe's numbering, no VAT in lei for a euro invoice, and Stripe sends nothing to e-Factura. On `invoice.paid` with an amount above zero, the API calls Oblio's API (`POST /api/docs/invoice`, OAuth with the account email and the API secret) with the lines of the Stripe invoice. Oblio numbers it in a series of its own, `SSMUSOR`, so the PFA's other invoices (series `CMA`, still the default) keep their numbering. It shows the VAT in lei at the BNR rate, sends the invoice by email (`sendEmail`) to the owner, or to the organization's email for invoices when one is set, and to e-Factura (with "Trimite automat e-Factura în SPV" on in Oblio). The Stripe invoice id is the call's `idempotencyKey`, so a webhook delivered twice cannot issue two invoices; the Oblio number and PDF link are stored against it. Right after issue the API downloads the PDF into a private Storage bucket, `billing-invoices`, which has no policies: the invoice list on the Abonament tab hands out a short-lived signed link after checking the owner. Our copy keeps access behind our own checks and outlives a change of Oblio account or link format; the legal copy stays in Oblio and SPV for the ten years the law requires, and ours is deleted with the account. The invoice is marked collected at issue, as "Card" with Stripe's payment reference, and its VAT uses Oblio's default BNR rate, until the accountant answers #628. A refund issues a storno against the original (`referenceDocument`, `refund: 1`).

The credentials are `OBLIO_CLIENT_ID` (the account's login email) and `OBLIO_CLIENT_SECRET` in both GitHub environments, the same Oblio account for both. Oblio regenerates the secret whenever the account's password is reset; invoicing then fails until the new secret is set, and the API's error on a refused login says so.

An invoice is issued only once paid, never for a payment that may still fail. Oblio has no test mode and its API issues an invoice at once, without a draft. Non-prod therefore issues **proformas** instead, in the same account, in a series of their own, `TEST`, from the same data: a proforma is not a fiscal document, is never sent to e-Factura, and leaves the invoice numbering alone. Non-prod never asks Oblio to email them, and makes them all out to one fixed test client, so the account's client list does not fill with the test companies of non-prod; the lines, prices, VAT and layout are the real ones. The accountant is told the series holds test proformas, which are not recorded.

The Stripe marketplace app "RO E-Factura" (Derikon Labs) was considered: it makes Stripe's invoices the official ones and uploads them to e-Factura. It was set aside because it converts no VAT to lei, issues the invoice when Stripe finalizes it rather than when it is paid, needs our SPV certificate and write access to Stripe, and would split the PFA's books between two systems. Connectors such as Make or Zapier were set aside for the lack of idempotency and for adding a processor of client data.

### Changes during a period

Adding a pack or a member, or moving from Start to Profesional, is charged for the days left, as a line on the next invoice: on a monthly plan nothing is charged at once. On an annual plan, where the rest of the year can be a large sum, the prorated amount is charged at once. Whatever an upgrade replaces is credited for its unused part: moving from Start to Profesional halfway through a month credits half of Start's 39 € and charges half of Profesional's 149 €, Start's packs included. Removing a pack or a member, or moving down a plan, takes effect at the next renewal, and nothing is credited.

Moving down from Profesional to Start adds the packs the organization's employees need today, shown before it confirms; Start is offered only with at most 600 employees (Start's ceiling on the pricing page, since Start with packs would cost more than Profesional by then) and at most two members, and otherwise says which of the two does not fit. Moving from monthly to annual happens at once: the unused part of the month is credited and the year is charged, less that credit; from annual to monthly, at the end of the paid year.

### Changing prices

A new price reaches existing subscriptions at their first renewal at least 30 days after an email announcing it, and they may cancel before then. An annual subscription keeps its price until its year ends. Each subscription records its price version, so a change is a script that moves subscriptions to the new Stripe price at their renewal. The 24-month launch price discussed on 2026-10-25 is not promised publicly.

### Limits and usage

What is counted: active employees of active clients (former employees, leads and archived clients do not count), members, and SMS codes sent in the month.

- **Employees over the plan's number.** At once: a banner and an email offering the pack, and nothing blocks. If no pack is added within a month, the organization cannot add employees, or clients that have employees, until it adds a pack or archives clients; everything it already has keeps working. A pack is never added on the owner's behalf. The pricing page's FAQ changes to say so.
- **Members.** Inviting past the plan's members needs the extra member first.
- **SMS go only to Romanian numbers (+40)**, against SMS pumping; the invitation forms say so where the phone is entered. Lifting it is #622.
- **SMS over the month's allowance** keep being sent, at about 0.10 € each, billed as one metered line on the next invoice; warnings at 80 % and 100 %. Stopping them would stop employees without an email from signing, which is the work the app exists for. This replaces the "+100 SMS" pack. The comparison table gets "apoi 0,10 € / SMS". Our code texts are plain ASCII, one SMS segment each (Twilio, about 0.072 € to Romania).

### Cancelling and ending an account

Cancelling stops the renewal; the plan runs to the end of the period paid and nothing is refunded, monthly or annual. The account then becomes read-only for 30 days and is deleted, the same as a trial that ends. Reminders go out at 30, 7 and 1 days before the deletion.

The export comes first. "Exportă tot" is an owner's tab in the organization pages (next to Echipă, Date firmă, Abilitări), linked from the cancellation step and from the read-only banner, never part of the main screens. It builds one archive in the background and emails a link: per client, the issued documents in PDF and Word, the signed sheets as signed PDFs with their signature record, test results, the employee register as a spreadsheet, the service contract and the uploaded files. Today's per-client download leaves the signed copies out by design (#440); the export does not.

The employer, not the provider, keeps its employees' records. So each client also gets a handover link the provider can send, valid until the deletion, and a button "Anunță participanții" lets the provider tell the client's participants that the portal closes. We do not email participants ourselves: the relationship is the provider's.

### Tester trials

Testers get an **extended trial**: the same trial with a later end, never a discount and never a payment for their work, which would read as a barter of services subject to VAT. A tester's trial may include SMS, at the full allowance of the plan it tries (Profesional's), when the tester needs workers without an email; the workflow's option for it is off by default. Until the admin area exists (#611, deferred until after the tester round), a manual GitHub workflow, "Extinde perioada de probă", sets an organization's trial end: the environment, the owner's email, the date and a reason, written to `subscription_changes` with the GitHub account that ran it. It only moves an end later, never earlier. For an organization without a subscription it starts a trial, and says so, since that puts a free account on a clock.

### Terms and express acceptance

The Terms gain the subscription rules: automatic renewal, cancellation, no refunds, price changes with 30 days' notice, the over-limit rule, extra SMS, read-only and deletion. Article 1203 of the Civil Code gives standard clauses that limit liability, renew the contract tacitly, suspend performance, let one side end the contract, or choose the law and the court, effect only if the other side accepts them expressly in writing. Onboarding therefore asks for two acceptances, each required: the data processing agreement, and the Terms with a short, plain mention of those clauses and their points ("inclusiv clauzele despre abonament, răspundere și încetare (punctele 8–10 și 12)"). A separate checkbox listing every clause was tried and dropped: it read as alarming at the moment someone signs up. The terms version is bumped. The express acceptance is recorded on its own, as a time on the organization, and the database refuses to create an organization without it, so neither the API nor a direct call to the data API can skip it. A later version that changes those clauses needs the same express acceptance again; point 11's "continued use means acceptance" does not reach them. The wording, and whether a checkbox is enough for "în scris", go to a lawyer before sign-up is public, with the other questions in #629.

### Administration

An admin area at `/admin` in the existing app, server-checked and behind MFA, with an audit log, is #611. It waits until the testers are on.

### Moving from the PFA to an SRL

The seller's identity (name, CUI, registry number, invoice series, Stripe account, Oblio company) is configuration, every subscription records its Stripe account, and every invoice its issuer. A move is then configuration and a migration, not a rewrite: the clients accept the SRL's terms and data processing agreement in the app (a contract does not move to another legal person without the other side's consent); Stripe either updates the account's legal entity or, if it will not, opens a new account and copies the customers and saved cards on request, after which a script recreates the subscriptions; the SRL gets its own Oblio series and SPV access. Annual subscriptions already paid to the PFA either finish there or are refunded pro rata.

### Order of work

**Phase 1, before the testers start:**

1. This ADR.
2. The database: `subscriptions` and `subscription_changes`, the access function, the trial started by `create_organization`, and the function the workflow calls. pgTAP tests.
3. The API: the subscription and access on `GET /me`; read-only enforced for members and participants.
4. The app: a banner with the trial's end, and the read-only state.
5. The workflow "Extinde perioada de probă" and its script.
6. The Terms' subscription section, the new terms version, and the express-acceptance checkbox at onboarding.

**Phase 2, before the waitlist email and public sign-up:**

7. Stripe: the plan catalogue, the subscription's Stripe fields, the setup script and its workflow, the webhook handler; then creating, changing and cancelling a subscription with their proration, and the portal session for the card.
8. Oblio: the invoice on payment, the storno on refund, the `TEST` proformas on non-prod.
9. The Abonament tab, as designed on the canvas (https://claude.ai/artifact/6xc348k1jYPLV4XoTDQLmX, approved 2026-10-27): status and next payment, usage against limits with the SMS counter, choosing and changing the plan with the Payment Element, packs, cancelling, the email for invoices, the link to Stripe's portal, the invoices with our PDF copy, the members' view. The plan badge's popover leads there ("Alege un plan" instead of "Scrie-ne ca să continui"). A help article for it.
10. Usage and limits: the counts, the banners and emails, the one-month block on adding employees, no SMS during a trial unless a tester's includes them, SMS to +40 only, metered SMS.
11. The emails: trial ending (7, 3, 1 days), payment failed, a payment waiting for the client's confirmation, a card about to expire, read-only and the deletion countdown, limits passed, SMS at 80 % and 100 %.
12. "Exportă tot", the per-client handover link, "Anunță participanții", and the deletion job.
13. The two Profesional lines already sold: "Fiecare coleg își vede clienții lui" and "Documente fără marca SSM Ușor".
14. The site: the FAQ and table changes above, the pricing buttons turned to sign-up (`pricingCta` in `pricing.ts`), the header's "Creează un cont" linked, Stripe and Oblio named in the privacy policy.
15. Registration made public: the CAPTCHA ADR 004 requires before the page is linked, and the answers to #628 and #629. Stripe's live verification, the Stripe and Oblio credentials in both environments, and the dashboard settings above were done on 2026-10-27; the webhook secrets follow the setup script.

The testers' round comes between the phases; the waitlist hears only after it.

## Consequences

- Stripe, Oblio and our database each hold part of the truth. Ours decides access; Stripe decides money; Oblio holds the legal invoice. The webhook handler is what keeps them in step, and a lost webhook is caught by the next one for the same subscription, which carries the whole state.
- An organization without a subscription row is free forever. That is deliberate for internal accounts and dangerous if a row is ever deleted by hand.
- Read-only is enforced where honest use goes, not everywhere.
- The prices on the site and in Stripe are written in two places, `pricing.ts` and the plan catalogue the setup script reads. A check that compares them can come with the script.
- The checkout is ours to keep working: its states, its errors and the 3D Secure step, which a hosted page would have handled. The card form itself stays Stripe's.
- Annual clients get a Stripe invoice of zero in every month without extra SMS. It never reaches Oblio or the client; it only lists in Stripe's dashboard.
- Two pieces of published copy change in phase 2: the FAQ about going over the limit and about a trial without a plan, and the SMS line of the comparison table.
- The Terms' version changes, so invited members accept the new one, as they do any version.
