# ADR 029: Billing, plans and trials

- Status: proposed
- Date: 2026-10-26

## Context

The prices are published at `ssmusor.ro/preturi/` since #606–#608: Start at 39 € and Profesional at 149 € a month without VAT, Enterprise on request, an annual price worth two months, packs of employees and an extra member as add-ons. The page promises a 30-day trial without a card at launch and says that going over a limit never blocks the work. Sign-up is not public yet ([ADR 004](adr-004-registration-and-onboarding.md)): registration and onboarding are built and live, nothing links to them, and every organization so far came from the seed or from a tester.

Nothing in the app knows about plans, trials or payment. Before the waitlist hears that accounts are open, the app has to start a trial, take payment, issue the Romanian invoice, count usage against the plan, and end an account the way the Terms already promise (30 days to export, then deletion: Termeni point 6, Acordul de prelucrare point 9). Before that, two or three testers start using it for free in exchange for their feedback.

The seller is Mircea's PFA, `Casapu Mircea-Adrian PFA`, VAT-registered, CAEN 6210, which already invoices another client through Oblio and has a euro account at ING. If the product does well, the business moves to an SRL, which will register for VAT.

The decisions below were taken in conversation on 2026-10-25 and 2026-10-26. The prices and lines themselves live in `apps/marketing/src/components/site/pricing.ts`, which is the only place they are written; this ADR does not repeat the numbers that may change.

## Decision

### Plans and the trial

Three plans: **Start**, **Profesional**, **Enterprise**. A plan is about scale and team, never about compliance: every plan has every document, training, test and signature. Enterprise is a quote, sold by email, not a self-serve plan.

Every new organization starts a **trial** of 30 days with everything Profesional includes: 1,500 employees, 3 members and 50 SMS codes. After the 50 SMS codes, sign-in and signing codes go by email where the person has one. No card is asked for. The trial lives in our database; Stripe knows nothing of an organization until it picks a plan.

When the trial ends without a plan, the organization becomes **read-only** (below). The pricing page's FAQ says today that without a plan the documents stay viewable and downloadable with no end; it changes to say 30 days.

### Access: full, read-only, deleted

An organization's **access** is derived from timestamps, not set by a job:

- **full** while nothing has ended: during a trial, while a subscription is paid or retrying a failed payment, and for an organization with no subscription row at all;
- **read-only** for 30 days after full access ends: members and participants see and download everything, nobody changes anything, and the export ("Exportă tot") works;
- **deleted** after those 30 days, by a scheduled job that removes the organization and everything under it, as the Terms promise. Backups roll over in their own cycle.

Full access ends when a trial ends without a plan, at the end of the period already paid after a cancellation, or 14 days after the first failed renewal if Stripe's retries have not succeeded by then. Subscribing again while read-only restores full access with everything as it was.

An organization without a subscription row has full access indefinitely. That covers the seeded organizations, the end-to-end test accounts on both environments, and every organization created before this ADR, so nothing needs backfilling. Only onboarding and checkout create rows.

Read-only is enforced by the API: a member's request that changes something (`POST`, `PUT`, `PATCH`, `DELETE`) answers `403` with the reason `read_only` unless the route is on a short allowlist of requests that only read: printing a document, acknowledging an update. A participant's signing, test attempts and notices answer the same. The database does not enforce it: the publishable key ships in the SPA, so a member who calls the data API directly could still write. That is accepted. It saves a read-only account from nothing it could not do through the export, and a write policy on every table is a large change for a case no honest customer meets.

### Subscriptions in our database

One row per organization in `subscriptions`: the plan, the status (`trialing`, `active`, `past_due`, `canceled`), the end of the trial, the end of full access (`access_until`, null while nothing is due to end), and later the Stripe customer and subscription ids, the billing interval, the price version, the quantities of packs and members, and the Stripe account the subscription belongs to. Every change to a row is also written to `subscription_changes` with who made it (onboarding, Stripe, a workflow, later an admin), what changed and why.

Members of the organization may read their row; nobody writes it except through security-definer functions and the service key. `GET /me` carries the access, the plan, the status and the dates, so the app knows without a separate request.

### Stripe takes the payment

Stripe Billing on Mircea's PFA account (individual / sole proprietor, Romania). Decided in the account setup on 2026-10-26: euro payouts to the ING euro account, automatic and monthly; Radar Lite; no Stripe Tax; no Managed Payments (Stripe as merchant of record costs 3.5 % more, bills from abroad and would push clients without a VAT code into registering for one); no climate contribution; statement descriptor `SSMUSOR.RO`, shortened `SSM USOR`.

- **Products and prices are code.** A setup script creates them through the API in both environments: the plans monthly and annually, the packs, the extra member, the metered SMS price, a fixed tax rate of 21 % added to the price, the customer portal configuration and the webhook endpoint. Non-prod uses a Stripe sandbox, production the live account. A price change is a pull request.
- **Checkout is Stripe's hosted page**, in Romanian with our logo. The customer is created at that moment with the organization's company details, which onboarding already took from ANAF, confirmed by the owner. Card data never touches our servers.
- **The customer portal is Stripe's**, for the card and for cancelling. Its invoice history is off. It cannot change a subscription with several items, so plan and pack changes are ours.
- **Webhooks** (`checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`) update `subscriptions` and trigger the invoice. They are verified with the signing secret and handled idempotently by event id.
- **Stripe's own emails are off.** The client gets one email per invoice, from Oblio.
- **Promotion codes** stay available for public offers later (Stripe's coupons and codes at checkout); none at launch.

### Oblio issues the invoice

A Stripe invoice is not a Romanian one: it has Stripe's numbering, no VAT in lei for a euro invoice, and Stripe sends nothing to e-Factura. On `invoice.paid` with an amount above zero, the API calls Oblio's API (`POST /api/docs/invoice`, OAuth with the account email and the API secret) with the lines of the Stripe invoice. Oblio numbers it in a series of its own, `SSMU`, so the PFA's other invoices keep their numbering. It shows the VAT in lei at the BNR rate, sends the invoice to the client by email (`sendEmail`) and to e-Factura (with "Trimite automat e-Factura în SPV" on in Oblio). The Oblio number and PDF link are stored against the Stripe invoice id, which makes the call idempotent and feeds Setări → Facturi. A refund issues a storno against the original (`referenceDocument`, `refund: 1`).

An invoice is issued only once paid, never for a payment that may still fail. Oblio has no test mode, so non-prod records what it would have issued and calls nothing.

The Stripe marketplace app "RO E-Factura" (Derikon Labs) was considered: it makes Stripe's invoices the official ones and uploads them to e-Factura. It was set aside because it converts no VAT to lei, issues the invoice when Stripe finalizes it rather than when it is paid, needs our SPV certificate and write access to Stripe, and would split the PFA's books between two systems. Connectors such as Make or Zapier were set aside for the lack of idempotency and for adding a processor of client data.

### Changes during a period

Adding a pack or a member, or moving from Start to Profesional, is charged for the days left, as a line on the next invoice: on a monthly plan nothing is charged at once. On an annual plan, where the rest of the year can be a large sum, the prorated amount is charged at once. Removing a pack or a member, or moving down a plan, takes effect at the next renewal, and nothing is credited.

### Changing prices

A new price reaches existing subscriptions at their first renewal at least 30 days after an email announcing it, and they may cancel before then. An annual subscription keeps its price until its year ends. Each subscription records its price version, so a change is a script that moves subscriptions to the new Stripe price at their renewal. The 24-month launch price discussed on 2026-10-25 is not promised publicly.

### Limits and usage

What is counted: active employees of active clients (former employees, leads and archived clients do not count), members, and SMS codes sent in the month.

- **Employees over the plan's number.** At once: a banner and an email offering the pack, and nothing blocks. If no pack is added within a month, the organization cannot add employees, or clients that have employees, until it adds a pack or archives clients; everything it already has keeps working. A pack is never added on the owner's behalf. The pricing page's FAQ changes to say so.
- **Members.** Inviting past the plan's members needs the extra member first.
- **SMS over the month's allowance** keep being sent, at about 0.10 € each, billed as one metered line on the next invoice; warnings at 80 % and 100 %. Stopping them would stop employees without an email from signing, which is the work the app exists for. This replaces the "+100 SMS" pack. The comparison table gets "apoi 0,10 € / SMS". Our code texts are plain ASCII, one SMS segment each (Twilio, about 0.072 € to Romania).

### Cancelling and ending an account

Cancelling stops the renewal; the plan runs to the end of the period paid and nothing is refunded, monthly or annual. The account then becomes read-only for 30 days and is deleted, the same as a trial that ends. Reminders go out at 30, 7 and 1 days before the deletion.

The export comes first. "Exportă tot" is an owner's tab in the organization pages (next to Echipă, Date firmă, Abilitări), linked from the cancellation step and from the read-only banner, never part of the main screens. It builds one archive in the background and emails a link: per client, the issued documents in PDF and Word, the signed sheets as signed PDFs with their signature record, test results, the employee register as a spreadsheet, the service contract and the uploaded files. Today's per-client download leaves the signed copies out by design (#440); the export does not.

The employer, not the provider, keeps its employees' records. So each client also gets a handover link the provider can send, valid until the deletion, and a button "Anunță participanții" lets the provider tell the client's participants that the portal closes. We do not email participants ourselves: the relationship is the provider's.

### Tester trials

Testers get an **extended trial**: the same trial with a later end, never a discount and never a payment for their work, which would read as a barter of services subject to VAT. Until the admin area exists (#611, deferred until after the tester round), a manual GitHub workflow, "Extinde perioada de probă", sets an organization's trial end: the environment, the owner's email, the date and a reason, written to `subscription_changes`.

### Terms and express acceptance

The Terms gain the subscription rules: automatic renewal, cancellation, no refunds, price changes with 30 days' notice, the over-limit rule, extra SMS, read-only and deletion. Article 1203 of the Civil Code gives standard clauses that limit liability, renew the contract tacitly, suspend performance, let one side end the contract, or choose the law and the court, effect only if the other side accepts them expressly in writing. Onboarding therefore gets a second checkbox, beside the existing acceptance, that names those clauses and the points where they are. The terms version is bumped, and the acceptance is recorded as today. The wording goes to a lawyer before sign-up is public.

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

7. Stripe: the setup script, checkout, the webhook handler, the customer portal, plan and pack changes with their proration.
8. Oblio: the invoice on payment, the storno on refund, the non-prod stand-in.
9. Setări → Abonament: status and next payment, usage against limits with the SMS counter, choosing and changing the plan, packs, the link to Stripe's portal, the Facturi list. A help article for it.
10. Usage and limits: the counts, the banners and emails, the one-month block on adding employees, metered SMS.
11. The emails: trial ending (7, 3, 1 days), payment failed, read-only and the deletion countdown, limits passed, SMS at 80 % and 100 %.
12. "Exportă tot", the per-client handover link, "Anunță participanții", and the deletion job.
13. The two Profesional lines already sold: "Fiecare coleg își vede clienții lui" and "Documente fără marca SSM Ușor".
14. The site: the FAQ and table changes above, the pricing buttons turned to sign-up (`pricingCta` in `pricing.ts`), the header's "Creează un cont" linked, Stripe and Oblio named in the privacy policy.
15. Registration made public: the CAPTCHA ADR 004 requires before the page is linked, Stripe's live verification finished, the Stripe and Oblio secrets in both environments.

The testers' round comes between the phases; the waitlist hears only after it.

## Consequences

- Stripe, Oblio and our database each hold part of the truth. Ours decides access; Stripe decides money; Oblio holds the legal invoice. The webhook handler is what keeps them in step, and a lost webhook is caught by the next one for the same subscription, which carries the whole state.
- An organization without a subscription row is free forever. That is deliberate for internal accounts and dangerous if a row is ever deleted by hand.
- Read-only is enforced where honest use goes, not everywhere.
- The prices on the site and in Stripe are written in two places, `pricing.ts` and the setup script. A check that compares them can come with the script.
- Two pieces of published copy change in phase 2: the FAQ about going over the limit and about a trial without a plan, and the SMS line of the comparison table.
- The Terms' version changes, so invited members accept the new one, as they do any version.
