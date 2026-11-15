# ADR 029: Billing, plans and trials

- Status: proposed
- Date: 2026-10-26, amended 2026-10-27 (our own checkout with the Payment Element instead of Stripe's hosted Checkout, the account settings, the credentials)
- Amended 2026-10-31: only signing codes count against the SMS allowance, on the subscription's month, with a safety cap, warnings and +40 for every SMS; each plan's import credits and a welcome gift at the first payment (#640); signing codes at the chosen plan's allowance with a hard stop between choosing a plan during the trial and the first payment; one tester switch for SMS and credits; manual workflows that add credits and signing codes. See "Limits and usage" and "Tester trials".
- Amended 2026-11-14: a new organization's trial lasts 14 days instead of 30; trials already running keep their end, and the 30 days of read-only access after it are unchanged. See "Plans and the trial".
- Amended 2026-11-14: offers (leads, [ADR 007](adr-007-leads-and-service-contracts.md)) and their contracts are a Profesional feature; on Start the existing ones are read, archived, restored and promoted, and nothing else about them changes. See "Plan features".
- Amended 2026-11-14, [below](#amendment-2026-11-14-plans-by-employee-step): each plan is priced by a step of employees, with three users on Start and ten on Profesional, and no packs or extra member; the SMS codes and AI credits follow the step; extras past what a step includes are the owner's choice, off until the screen that turns them on exists. It replaces the packs, the extra member, the billed SMS past the allowance and the safety cap described below.
- Amended 2026-11-14, [below](#amendment-2026-11-14-choosing-a-plan-ends-the-trial): choosing a plan during the trial ends the trial when the first payment, taken at once, goes through; the days left are not kept. It replaces the first charge at the trial's end and everything "before the first payment".
- Amended 2026-11-14, [below](#amendment-2026-11-14-welcome-credits-fixed-at-the-first-payment): the welcome credits are the step's at the first payment and never change after it; moving up no longer adds the difference.

## Context

The prices are published at `ssmusor.ro/preturi/` since #606–#608: Start at 39 € and Profesional at 149 € a month without VAT, Enterprise on request, an annual price of ten months (two months free), packs of employees and an extra member as add-ons. The page promises a 30-day trial without a card at launch and says that going over a limit never blocks the work. Sign-up is not public yet ([ADR 004](adr-004-registration-and-onboarding.md)): registration and onboarding are built and live, nothing links to them, and every organization so far came from the seed or from a tester.

Nothing in the app knows about plans, trials or payment. Before the waitlist hears that accounts are open, the app has to start a trial, take payment, issue the Romanian invoice, count usage against the plan, and end an account the way the Terms already promise (30 days to export, then deletion: Termeni point 6, Acordul de prelucrare point 9). Before that, two or three testers start using it for free in exchange for their feedback.

The seller is Mircea's PFA, `Casapu Mircea-Adrian PFA`, VAT-registered, CAEN 6210, which already invoices another client through Oblio and has a euro account at ING. If the product does well, the business moves to an SRL, which will register for VAT.

The decisions below were taken in conversation on 2026-10-25 and 2026-10-26. The prices and lines themselves live in `apps/marketing/src/components/site/pricing.ts`, which is the only place they are written; this ADR does not repeat the numbers that may change. (Amended 2026-10-31: the SMS and credit allowances are written under "Limits and usage", since the rules there depend on them and the pricing page does not list the credits yet.)

## Decision

### Plans and the trial

Three plans: **Start**, **Profesional**, **Enterprise**. A plan is about scale and team, never about compliance: every plan has every document, training, test and signature. Enterprise is a quote, sold by email, not a self-serve plan: it never appears in our checkout, and setting it on an organization by hand is left until a first Enterprise client exists.

Every new organization starts a **trial** of 30 days (14 since the amendment of 2026-11-14, the `trialDays` of the contracts, which `create_organization` repeats and a test holds equal) with Profesional's features, employees (1,500) and members (3), but **without SMS**: sign-in and signing codes go by email, and SMS start when a plan is chosen. A free account that can send SMS invites SMS pumping, and an allowance that jumps from a trial's few codes to a plan's hundreds reads oddly. A participant without an email cannot be invited during a trial; the invitation says why and what to do. (Amended 2026-10-31. No SMS of any kind goes out during a trial: invitations, sign-in codes, signing codes and the notices of a signature request all go by email. Until step 10 of the order of work, a trial's SMS are not stopped.) No card is asked for. The trial lives in our database; Stripe knows nothing of an organization until it picks a plan.

An organization that picks a plan before its trial ends keeps the days left: the card is saved at once, and the first charge, with the first invoice, falls on the day the trial would have ended (the Stripe subscription is created with that `trial_end`). Deciding early costs nothing, so nobody has a reason to wait. SMS start when the plan is chosen, since a saved card is the guard the trial lacked. Until the trial's end the organization keeps the trial's limits (Profesional's), then the plan's apply. (Amended 2026-10-31. Signing codes by SMS follow the chosen plan's allowance from the moment of choosing, with a hard stop until the first payment, and the credits stay the trial's 300 until the first payment brings the welcome gift; see "Before the first payment" under "Limits and usage".) From the moment of choosing, the plan badge shows the plan's name and the trial bar no longer shows. Cancelling before the first charge returns it to a trial without a plan, and nothing is charged.

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

### Plan features

(Added 2026-11-14.) Beyond its limits, a plan can include a **feature** that another lacks. The first is **offers**: the leads of [ADR 007](adr-007-leads-and-service-contracts.md) with their contracts, their files and the owners' notes about them. Profesional and Enterprise have them, and so does a trial, since a trial carries Profesional's features until it ends. (Amended 2026-11-14: paying for Start during the trial ends the trial, so offers become read-only from that payment; a Start chosen during the trial before then keeps them until the trial's end.) An organization without a subscription row has every feature, as it has full access.

On Start, the existing offers stay as they are: owners list and open them, download their contracts and files, archive and restore them, and turn them into clients. Creating an offer and changing anything about one is refused: its data, contact and notes, its files, and its contract's details, drafts, issuing, sending and signed copy. The contract of a client, a promoted offer's included, is not an offer's and stays on every plan. A copy signed by the client through the return link still arrives, as it does while read-only.

Unlike read-only access, the database enforces this one, for the rows and for the files written straight to Storage: the helpers its Storage policies ask, `is_draft_document_path` and `is_writable_client_file_path`, refuse a lead's paths as they refuse an archived client's. Offers live in the database's own rules already (the lead's stage, its policies and triggers), and a refused change there is one line of a trigger per table, so the refusal sits beside them: `organization_has_offers` decides, triggers refuse a lead's row and the rows under it with `CLL03`, and the API answers `403` with the reason `offers_not_in_plan`. The API asks the same function before anything leaves or is written outside the database, an email or a file, and `GET /me` reports it as `features.offers`, which the app reads to show offers as read-only with a note that leads to the Abonament tab. The menu keeps **Oferte** on Start, so the feature stays where people can find it.

### Subscriptions in our database

One row per organization in `subscriptions`: the plan, the status (`trialing`, `active`, `past_due`, `canceled`), the end of the trial, the end of full access (`access_until`, null while nothing is due to end), and later the Stripe customer and subscription ids, the billing interval, the price version, the quantities of packs and members, the Stripe account the subscription belongs to, and an optional email for invoices. Every change to a row is also written to `subscription_changes` with who made it (onboarding, Stripe, a workflow, later an admin), what changed and why.

Members of the organization may read their row; nobody writes it except through security-definer functions and the service key. `GET /me` carries the access, the plan, the status and the dates, so the app knows without a separate request.

### Stripe takes the payment

Stripe Billing on Mircea's PFA account (individual / sole proprietor, Romania). Decided in the account setup on 2026-10-26: euro payouts to the ING euro account, automatic and monthly; Radar Lite; no Stripe Tax; no Managed Payments (Stripe as merchant of record costs 3.5 % more, bills from abroad and would push clients without a VAT code into registering for one); no climate contribution; statement descriptor `SSMUSOR.RO`, shortened `SSM USOR`.

- **Products and prices are code.** A setup script creates them through the API in both environments: the plans monthly and annually, the packs and the extra member (on an annual plan these too cost ten months a year: 150 €, 400 €, 150 €), the metered SMS price (monthly on every plan), a fixed tax rate of 21 % added to the price, the customer portal configuration, the app's domains for Apple Pay, and the webhook endpoint's list of events. Non-prod uses a Stripe sandbox (not the older test mode, which shares settings with the live account), production the live account. A price change is a pull request.
- **The checkout is ours, with Stripe's Payment Element**, on a new **Abonament** tab of the organization pages (next to Echipă, Date firmă, Abilitări; Setări is a member's personal page, the subscription is the organization's) in our own design system: the plan, the interval and the packs are chosen on our page, the card form is Stripe's iframe inside it, and the first payment is confirmed in the browser, 3D Secure included. Card data never touches our servers, so our card-security obligations stay as light as with a hosted page. The customer is created when a plan is picked, with the organization's company details, which onboarding took from ANAF and the owner confirmed. Card, Apple Pay and Google Pay are offered; Stripe's Link is off. Bank transfer can come later, for annual and Enterprise clients, invoiced by hand. Only the owner chooses, changes or cancels a plan. The other members see the tab too: the plan, its status, the usage meters and the public list prices, but not the organization's amounts (the next payment, the extra SMS so far, what a change would cost), the card or the invoices; those are the owner's, as the invoices are readable only by the owner. In the checkout the packs cannot go below what the organization's employees need today. After a failed payment, saving a new card retries the open invoice at once; there is no separate "pay now" step. Cancelling asks for a reason, optionally: one choice and a free text.
- **Why not Stripe's hosted Checkout.** Extra SMS are billed monthly, so an annual subscription carries a monthly metered item. Stripe calls that a mixed-interval subscription; it needs flexible billing mode, which is the default for API versions from `2025-09-30.clover` on and is set on both accounts, and hosted Checkout cannot create one. Our own page also keeps the choice of plan and packs in the app instead of a detour to Stripe. The cost is one more pull request: the form, its error states and the 3D Secure step.
- **The customer portal is Stripe's, for the card only.** Its invoice history and its cancel button are off: on a mixed-interval subscription Stripe's cancel-at-period-end stops at the earliest item's end, which is a month into a paid year. Cancelling is our button, which cancels at `max_period_end`. Plan and pack changes are ours too, since the portal cannot change a subscription with several items.
- **Webhooks** (`customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`, `charge.refunded`, `customer.updated`) update `subscriptions`, trigger the invoice and, on a refund, its storno; a new default card saved in the portal (`customer.updated`) also becomes the subscription's and pays an open invoice at once. They are verified with the signing secret and handled idempotently by event id. An invoice of zero, such as an annual client's month without extra SMS, is recorded and goes no further.
- **Stripe's own emails are off**, in both accounts: receipts, invoices, credit notes, renewal and expiring-card reminders, failed payments and the link to confirm a payment. They do not exist in Romanian. The client gets one email per invoice, from Oblio, and our own emails for the rest (below).
- **Failed payments** are retried by Stripe's Smart Retries, up to 8 times within 2 weeks; then Stripe cancels the subscription and marks the invoice uncollectible. A payment waiting for the client's confirmation is cancelled after 15 days. That gives the 14 days of full access the Terms promise, then read-only. These, the emails and the branding (our icon and logo, forest `#18342e`, lime `#b6d86f`) are dashboard settings with no API, set by hand on 2026-10-27.
- **Promotion codes** stay available for public offers later (Stripe's coupons, applied by our checkout); none at launch.
- **Credentials**, per GitHub environment: `STRIPE_SECRET_KEY` (the sandbox key in non-prod; in production a live key limited to "full access except sensitive operations", which cannot pay out or move money), `STRIPE_WEBHOOK_SECRET`, and the variable `VITE_STRIPE_PUBLISHABLE_KEY` for the Payment Element. The webhook endpoint is created once by hand in each dashboard, because Stripe shows its signing secret only at creation and it goes straight to GitHub; the setup script then keeps its event list. Stripe's custom domains are not used: they only rename Stripe's hosted pages.
- **Where the code lives.** The calls to Stripe and Oblio, plan changes and the webhook handler are a `billing` module of the API, next to the database and the member's session; a Worker of its own would add a deployment and a copy of the secrets without isolating anything, since card data never reaches us. The plan picker and the Payment Element live in the app's subscription feature. The plan catalogue (Stripe price keys, limits, allowances) and the request shapes live in `packages/contracts`, read by the API, the app and the setup script. The setup script is an operator script of the API, run from a GitHub workflow so the keys stay in GitHub.

### Oblio issues the invoice

A Stripe invoice is not a Romanian one: it has Stripe's numbering, no VAT in lei for a euro invoice, and Stripe sends nothing to e-Factura. On `invoice.paid` with an amount above zero, the API calls Oblio's API (`POST /api/docs/invoice`, OAuth with the account email and the API secret) with the lines of the Stripe invoice. Oblio numbers it in a series of its own, `SSMUSOR`, so the PFA's other invoices (series `CMA`, still the default) keep their numbering. It shows the VAT in lei at the BNR rate, sends the invoice by email (`sendEmail`) to the owner, or to the organization's email for invoices when one is set, and to e-Factura (with "Trimite automat e-Factura în SPV" on in Oblio). The Stripe invoice id is the call's `idempotencyKey`, so a webhook delivered twice cannot issue two invoices; the Oblio number and PDF link are stored against it. Right after issue the API downloads the PDF into a private Storage bucket, `billing-invoices`, which has no policies: the invoice list on the Abonament tab hands out a short-lived signed link after checking the owner. Our copy keeps access behind our own checks and outlives a change of Oblio account or link format; the legal copy stays in Oblio and SPV for the five years the accounting law requires (Legea 82/1991 art. 25 as amended by Legea 36/2023: five years from 1 July of the year after the financial year), and ours is deleted with the account. The invoice is marked collected at issue, as "Card" with Stripe's payment reference, and its VAT uses Oblio's default BNR rate, until the accountant answers #628. A refund issues a storno against the original (`referenceDocument`, `refund: 1`).

The credentials are `OBLIO_CLIENT_ID` (the account's login email) and `OBLIO_CLIENT_SECRET` in both GitHub environments, the same Oblio account for both. Oblio regenerates the secret whenever the account's password is reset; invoicing then fails until the new secret is set, and the API's error on a refused login says so.

An invoice is issued only once paid, never for a payment that may still fail. Oblio has no test mode and its API issues an invoice at once, without a draft. Non-prod therefore issues **proformas** instead, in the same account, in a series of their own, `TEST`, from the same data: a proforma is not a fiscal document, is never sent to e-Factura, and leaves the invoice numbering alone. Non-prod never asks Oblio to email them, and makes them all out to one fixed test client, so the account's client list does not fill with the test companies of non-prod; the lines, prices, VAT and layout are the real ones. The accountant is told the series holds test proformas, which are not recorded.

The Stripe marketplace app "RO E-Factura" (Derikon Labs) was considered: it makes Stripe's invoices the official ones and uploads them to e-Factura. It was set aside because it converts no VAT to lei, issues the invoice when Stripe finalizes it rather than when it is paid, needs our SPV certificate and write access to Stripe, and would split the PFA's books between two systems. Connectors such as Make or Zapier were set aside for the lack of idempotency and for adding a processor of client data.

### Changes during a period

Adding a pack or a member, or moving from Start to Profesional, is charged for the days left, as a line on the next invoice: on a monthly plan nothing is charged at once. On an annual plan, where the rest of the year can be a large sum, the prorated amount is charged at once. Whatever an upgrade replaces is credited for its unused part: moving from Start to Profesional halfway through a month credits half of Start's 39 € and charges half of Profesional's 149 €, Start's packs included. Removing a pack or a member, or moving down a plan, takes effect at the next renewal, and nothing is credited.

Moving down from Profesional to Start adds the packs the organization's employees need today, shown before it confirms; Start is offered only with at most 600 employees (Start's ceiling on the pricing page, since Start with packs would cost more than Profesional by then) and at most two members, and otherwise says which of the two does not fit. Moving from monthly to annual happens at once: the unused part of the month is credited and the year is charged, less that credit; from annual to monthly, at the end of the paid year.

### Changing prices

A new price reaches existing subscriptions at their first renewal at least 30 days after an email announcing it, and they may cancel before then. An annual subscription keeps its price until its year ends. Each subscription records its price version, so a change is a script that moves subscriptions to the new Stripe price at their renewal. The 24-month launch price discussed on 2026-10-25 is not promised publicly.

### Limits and usage

What is counted: active employees of active clients (former employees, leads and archived clients do not count), members, the signing codes sent by SMS in the subscription's month, and the credits the imports use ([ADR 030](adr-030-import-from-documents.md)). (Amended 2026-10-31: every SMS code sent in the calendar month was counted before, and imports were not limited.)

- **Employees over the plan's number.** At once: a banner and an email offering the pack, and nothing blocks. If no pack is added within a month, the organization cannot add employees, or clients that have employees, until it adds a pack or archives clients; everything it already has keeps working. A pack is never added on the owner's behalf. The pricing page's FAQ changes to say so.
- **Members.** Inviting past the plan's members needs the extra member first.
- **SMS go only to Romanian numbers (+40)**, every kind of them: invitations, sign-in codes, signing codes and the notices of a signature request, against SMS pumping; the invitation forms say so where the phone is entered. Lifting it is #622. (Amended 2026-10-31 to name every kind. No organization on production has real clients yet, so nobody loses a number it already used.)
- **Only signing codes count against the SMS allowance**: Start 50 and Profesional 300 a month, the pricing page's "Coduri de semnare prin SMS, pe lună". Portal invitations, portal sign-in codes and the notices that a participant has trainings to sign are sent by SMS too, but not counted, and their cost is ours. They are bounded by the number of employees: one invitation per employee, resent at most every 10 minutes, one notice per training. Counting them would also have needed a rule for which organization a portal sign-in code belongs to; with signing codes only, the question does not arise. The prices do not change. (Amended 2026-10-31: every SMS code was counted before.)
- **The month is the subscription's.** The counter starts again on the day of the month the subscription renews (from 14.10 to 13.11, say), on an annual plan too, whose extra SMS are billed monthly. (Amended 2026-10-31: the calendar month before.)
- **Signing codes over the month's allowance** keep being sent, at about 0.10 € each, billed as one metered line on the next invoice. Stopping them would stop employees without an email from signing, which is the work the app exists for. This replaces the "+100 SMS" pack. The comparison table gets "apoi 0,10 € / SMS".
- **A safety cap at three times the allowance**: 150 signing codes a month on Start, 900 on Profesional. Below it, past the allowance, codes go out and are billed as above. Past it, no signing code goes by SMS: a signer with an email gets the code by email, and one without sees that the code cannot be sent now and that they should ask their specialist. The owner can raise the cap from the Abonament tab. The cap bounds a month's extra SMS to what the owner has agreed to. (Amended 2026-10-31: there was no cap.)
- **Before the first payment.** From choosing a plan during the trial until the first payment goes through, signing codes go by SMS up to the chosen plan's allowance, 50 on Start and 300 on Profesional, and stop there: no extra SMS and no safety cap. Past the allowance a signer with an email gets the code by email, and one without is told to ask their specialist, as past the cap. Choosing a plan and cancelling before the first charge costs nothing, so extra SMS sent in that window could never be billed; the hard stop bounds what we lose to one month's allowance, about 3.60 € on Start and 21.60 € on Profesional. From the first payment, extra signing codes and the safety cap above apply. In the same window the credits stay the trial's 300 in all; the welcome gift comes with the first payment. (Added 2026-10-31.)
- **Warnings.** The SMS meter on the Abonament tab's "Cât folosești" card shows the month's real count. From 80 % a bar at the top of the app, in the trial bar's style, says so: at 80 % it can be dismissed until the next day, at 100 % it stays until the renewal. The owner gets an email at 80 %, at 100 % and when the cap is reached. (Amended 2026-10-31: warnings at 80 % and 100 % were all this said before.)
- **One SMS segment per text.** Our texts are plain ASCII, one segment each (Twilio, about 0.072 € to Romania). This is built: the SMS Worker turns every text into plain ASCII and shortens names to fit 160 characters, under tests. The signature request's notice carries a link with no length guard of its own; a guard is a follow-up.
- **Import credits.** A trial has 300 credits for the whole trial; Start 300 a month and Profesional 1,500 a month, about 12 clients or 40 employees and about 60 clients or 200 employees read. Once, for moving a portfolio in, a **welcome gift** of 2,500 credits on Start and 10,000 on Profesional, granted when the first payment goes through, not when a plan is chosen during the trial: choosing and cancelling before the first charge costs nothing, so a gift given at choosing could be taken for free. It is not split between the two moments either. Monthly credits do not carry over, the gift never expires, and monthly credits are used first. How credits are counted, charged, refunded and topped up, and what a change of plan does to them, is in [ADR 030](adr-030-import-from-documents.md#usage-is-counted-in-credits). (Added 2026-10-31, deciding #640.)

Each plan's margin with everything used, from the costs measured by 2026-10-31 (Stripe's fees and the euro to dollar rate are estimates): Start at 39 € leaves about 32 € (83 %) after Stripe about 1.10 €, 50 SMS at 0.072 € (3.60 €) and its credits about 2.10 €, and about 14 € in the month the gift is used; Profesional at 149 € leaves about 113 € (76 %) after Stripe about 3.50 €, 300 SMS (21.60 €) and its credits about 10.50 €, and about 43 € in the month of the gift. The uncounted SMS come out of that margin, bounded by the employees and their trainings.

### Cancelling and ending an account

Cancelling stops the renewal; the plan runs to the end of the period paid and nothing is refunded, monthly or annual. The account then becomes read-only for 30 days and is deleted, the same as a trial that ends. Reminders go out at 30, 7 and 1 days before the deletion.

The export comes first. "Exportă tot" is an owner's tab in the organization pages (next to Echipă, Date firmă, Abilitări), linked from the cancellation step and from the read-only banner, never part of the main screens. It builds one archive in the background and emails a link: per client, the issued documents in PDF and Word, the signed sheets as signed PDFs with their signature record, test results, the employee register as a spreadsheet, the service contract and the uploaded files. Today's per-client download leaves the signed copies out by design (#440); the export does not.

The employer, not the provider, keeps its employees' records. So each client also gets a handover link the provider can send, valid until the deletion, and a button "Anunță participanții" lets the provider tell the client's participants that the portal closes. We do not email participants ourselves: the relationship is the provider's.

### Tester trials

Testers get an **extended trial**: the same trial with a later end, never a discount and never a payment for their work, which would read as a barter of services subject to VAT. One **tester switch**, off by default, gives a tester's trial both what the trial lacks: SMS, with 300 signing codes a month, and 1,500 credits a month, Profesional's allowances. Both stop hard at their limit: no extra SMS, no safety cap and no welcome gift, since a tester has no card to bill. Past either limit, a manual GitHub workflow tops the tester up: the one that adds credits ([ADR 030](adr-030-import-from-documents.md#usage-is-counted-in-credits)), or one that adds signing codes to the current month. Each is recorded, as "Extinde perioada de probă" is below, with the GitHub account that ran it and the reason. A paying owner at the safety cap raises the cap from the Abonament tab instead. (Amended 2026-10-31. The switch replaces the workflow's "with SMS" option, `subscriptions.trial_sms`, which gave the plan's SMS allowance only; a tester's trial without the switch has the ordinary trial's 300 credits.) Until the admin area exists (#611, deferred until after the tester round), a manual GitHub workflow, "Extinde perioada de probă", sets an organization's trial end: the environment, the owner's email, the date and a reason, written to `subscription_changes` with the GitHub account that ran it. It only moves an end later, never earlier. For an organization without a subscription it starts a trial, and says so, since that puts a free account on a clock.

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
9. The Abonament tab, as designed on Mircea's design canvas, approved 2026-10-27 (a private Claude artifact, so the decisions it settled are written in this ADR; the pull requests that build the tab carry screenshots): status and next payment, usage against limits with the SMS counter, choosing and changing the plan with the Payment Element, packs, cancelling, the email for invoices, the link to Stripe's portal, the invoices with our PDF copy, the members' view. The plan badge's popover leads there ("Alege un plan" instead of "Scrie-ne ca să continui"). A help article for it.
10. Usage and limits: the counts, the banners and emails, the one-month block on adding employees. SMS: none of any kind during a trial unless the tester switch is on, every kind to +40 only, the count of signing codes on the subscription's month, metered signing codes past the allowance, the safety cap with its fallback to email and the owner's raise, the meter with the real count and the bar from 80 %. Credits ([ADR 030](adr-030-import-from-documents.md#usage-is-counted-in-credits)): the allowances and a ledger, the welcome gift at the first payment, the charge of an import's known part when it starts and of each scanned page as it is found, with the balance allowed below zero by 150 at most and made up from the next month, the usage line in the upload dialogs, the refusal when credits run out, and the credits meter. The hard stop at the chosen plan's allowance between choosing a plan and the first payment. The tester switch in place of "with SMS", and the two manual workflows that add credits and signing codes. (Amended 2026-10-31 with the SMS and credit rules above.)
11. The emails: trial ending (7, 3, 1 days), payment failed, a payment waiting for the client's confirmation, a card about to expire, read-only and the deletion countdown, limits passed, signing codes at 80 %, at 100 % and at the safety cap, to the owner.
12. "Exportă tot", the per-client handover link, "Anunță participanții", and the deletion job.
13. The two Profesional lines already sold: "Fiecare coleg își vede clienții lui" and "Documente fără marca SSM Ușor".
14. The site: the FAQ and table changes above, a credits row in the comparison table, a short point on credits in the Terms with a new terms version (to the lawyer with #629), the pricing buttons turned to sign-up (`pricingCta` in `pricing.ts`), the header's "Creează un cont" linked, Stripe and Oblio named in the privacy policy.
15. Registration made public: the CAPTCHA ADR 004 requires before the page is linked (on since 2026-10-31, see ADR 004's amendment), and the answers to #628 and #629. Stripe's live verification, the Stripe and Oblio credentials in both environments, and the dashboard settings above were done on 2026-10-27; the webhook secrets follow the setup script.

The testers' round comes between the phases; the waitlist hears only after it.

## Consequences

- Stripe, Oblio and our database each hold part of the truth. Ours decides access; Stripe decides money; Oblio holds the legal invoice. The webhook handler is what keeps them in step, and a lost webhook is caught by the next one for the same subscription, which carries the whole state.
- An organization without a subscription row is free forever. That is deliberate for internal accounts and dangerous if a row is ever deleted by hand.
- Read-only is enforced where honest use goes, not everywhere.
- The prices on the site and in Stripe are written in two places, `pricing.ts` and the plan catalogue the setup script reads. A check that compares them can come with the script.
- The checkout is ours to keep working: its states, its errors and the 3D Secure step, which a hosted page would have handled. The card form itself stays Stripe's.
- Annual clients get a Stripe invoice of zero in every month without extra SMS. It never reaches Oblio or the client; it only lists in Stripe's dashboard.
- Two pieces of published copy change in phase 2: the FAQ about going over the limit and about a trial without a plan, and the SMS line of the comparison table. The table also gains a credits row, and the Terms a point on credits.
- Invitations, sign-in codes and signature-request notices by SMS are our cost, not the client's. They grow with the employees and their trainings; no price changes for them now.
- The Terms' version changes, so invited members accept the new one, as they do any version.

## Amendment 2026-11-14: plans by employee step

The pricing page changed on 2026-11-14 (#969, #976) and is again the source of what was promised: `apps/marketing/src/components/site/pricing.ts`. The app, the API, the database and Stripe follow it with a catalogue of its own, version `v2`, in `packages/contracts/src/billing.ts`.

### Why

- **The gap from 39 € to 149 € was too large.** A provider a little past Start's 250 employees, or one who needed a second colleague, either stacked packs and extra members onto Start or paid 149 € for a Profesional sized for 1,500. The SSM contact who needs three users would have been pushed to 149 €.
- **Steps follow the employees**, as Resend's volume steps follow e-mails: the price rises by a known amount at a known number, never by a pack chosen and counted by the owner.
- **Users are fixed per plan, three and ten, instead of paid seats.** A seat price on top of a step made two numbers to watch; a team past ten users is an Enterprise conversation anyway.
- **Extras are opt-in instead of billed by default.** Billing every signing code past the allowance, up to three times it, grew an invoice without the owner choosing it. Now nothing past what the step includes costs anything until the owner turns it on and sets a monthly ceiling.

### Plans and steps

A **step** (_treaptă_) is the most employees a plan covers at a price: the active employees of the active clients, in total, counted as before.

| Plan        | Users | Steps (employees) and monthly price without VAT                                               |
| ----------- | ----- | --------------------------------------------------------------------------------------------- |
| Start       | 3     | 250: 39 €, 500: 59 €, 750: 79 €                                                               |
| Profesional | 10    | 500: 89 €, 1,000: 119 €, 1,500: 149 €, 2,000: 179 €, 3,000: 239 €, 4,000: 299 €, 5,000: 359 € |

Paid yearly, a month costs ten twelfths of the monthly price, rounded down to a whole euro, and the year twelve such months: Start at 250 is 32 € a month, 384 € a year ("două luni gratuite"). Rounding down makes the annual prices of Start's steps not a fixed multiple of the monthly ones, which is one reason each step is a price of its own rather than a quantity of one price.

**Enterprise** is more than 5,000 employees or more than ten users: a quote, never in the checkout, as before. The packs (50 and 500 employees), the extra member and every other add-on are gone.

What each step includes, every month of the subscription:

- **SMS signing codes**: the step ÷ 5 (50 at 250, 1,000 at 5,000);
- **AI credits** (_credite AI_, the word every text people read uses now, for what were "credite pentru import"): 2 × the step + 250 (750 at 250, 10,250 at 5,000). Unused credits do not carry over;
- once, at the first payment, **welcome AI credits** that never expire: 10 × the step, at most 10,000 (2,500 at 250, 10,000 from 1,000 up).

What an action costs in credits does not change ([ADR 030](adr-030-import-from-documents.md#usage-is-counted-in-credits)).

### Stripe

One product per plan, as before, and one price per plan, step and period, under lookup keys such as `start_250_monthly_v2` and `profesional_5000_annual_v2`: twenty prices. A step change is therefore a change of the plan item's price on the same subscription, with no quantities. The metered SMS price stays on every subscription, as `sms_overage_monthly_v2`, so that turning extras on later needs no change to existing subscriptions; while extras are off nothing is reported to its meter, and it bills nothing. The `v1` prices stay in both accounts, active: nothing is archived, and a `v1` subscription keeps working until it is changed (below). The setup script creates the `v2` prices; running it is an operator's step in each account.

### Choosing and changing

The owner chooses a plan, a step and a period. The checkout refuses a step below today's employees (`step_below_need`), and a plan with fewer users than the organization has members (`members_over_plan`); Start is refused above 750 employees (`employees_over_plan`). Past 5,000 employees or ten members the page points to Enterprise.

"Changes during a period" above applies with one rule for what is an upgrade: the higher monthly price. Every Profesional step costs more than every Start step, so moving from Start to Profesional is still an upgrade. An upgrade, a higher step on the same plan included, applies at once and is prorated as before (on the next invoice on a monthly plan, charged at once on an annual one, the unused part credited); a lower step, or Profesional to Start, applies at the next renewal and credits nothing; monthly to annual at once, annual to monthly at the end of the paid year. With no quantities left, a change never both adds and removes, so the `split_change` refusal no longer arises from a choice, only from a change asked while an annual payment for an earlier one waits.

### Limits and usage

- **Employees over the step.** The meter on the Abonament tab shows how many are over and offers the next step. After a month still over, nothing that adds an employee is accepted until the step covers them; see the amendment below, "A month over the step".
- **Users.** Fixed per plan, three or ten, shown on the meter with the open invitations, each of which holds a place. With no seat to buy, an invitation is refused (`member_limit_reached`) once the members and the open invitations fill the plan's users; renewing an address's own open invitation is not, and renewing an expired one takes a place again. An address that is already a member still answers `already_member`. A trial has ten; a plan chosen during the trial holds the organization to its own users from the moment it is chosen, since the first charge bills them. Two invitations sent in the same instant at one place short can both pass: the count and the insert are not locked together. Accepting an invitation already sent is never refused. A plan with fewer users than the organization's members cannot be chosen.
- **The allowances follow the step of the subscription row.** Because the row takes a change when it applies, a higher step's SMS codes and AI credits count at once, for the month already under way (the difference, as an upgrade gave before), and a lower step's from the renewal. The welcome credits are brought up to the step's, so moving up after the first payment adds the difference once, and moving down takes nothing back.
- **Before the first payment** nothing changes: a plan chosen during the trial sends signing codes up to its step's allowance with a hard stop, and the credits stay the trial's 300 until the first payment brings the step's month and welcome credits.
- **A trial** counts its employees and users against Profesional's largest step and ten users. Its length and its credits are its own amendment.
- **Testers** keep 300 signing codes and 1,500 AI credits a month, now numbers of their own instead of Profesional's.

### Extras

Past what the step includes, extras are **off by default**. The owner will turn them on with a monthly ceiling they choose: then each extra signing code by SMS costs 0.10 € and each extra 100 AI credits 1.50 €, up to the ceiling, on the next invoice. That screen is being designed and is not part of this build. Until it exists every organization is off:

- at the allowance, a signing code goes by email to a signer with an email, and a signer without one is told to ask their specialist, as at the hard stop before the first payment; it starts again at the renewal;
- when the AI credits run out, a new import waits for the next month; the manual workflow that adds credits stays for support;
- nothing is billed past the step and nothing is reported to Stripe's meter;
- nothing can be bought: the pack of 1,000 credits for 15 € that ADR 030 announced is dropped.

The safety cap at three times the allowance, its "Ridică limita", its dialog, the endpoint that set it and its email no longer exist. Its column stays, unused, for the ceiling the opt-in will need; the overage report to Stripe and its daily retry stay too, and only run for a code billed past the allowance, which none is. The email for the codes past the allowance keeps its wording for billed codes, which the API no longer asks for.

### Existing rows

Production holds one tester's trial and no paying subscription, so no customer moves. Each subscription row gets its step; a row with a `v1` subscription takes the smallest `v2` step of its plan that covers what it had (the plan's included employees and its packs): Start without packs takes 250, with up to five packs 500, with more 750; Profesional without packs takes 1,500, with one pack 2,000, and so on up to 5,000. An extra member is dropped: Start's three users already cover the two it allowed. Trials and rows without a plan have no step. Its Stripe subscription keeps its `v1` prices, read back as that same step, until the owner changes it, which moves it to `v2`; a script that moves every `v1` subscription at its renewal, as "Changing prices" describes, is not needed while none is paid.

### What this replaces

In the sections above: the packs and the extra member in "Stripe takes the payment" and "Changes during a period"; "Moving down from Profesional to Start adds the packs…" and Start's ceiling of 600 employees and two members; under "Limits and usage", the employees and members rules, each plan's SMS allowance, the signing codes billed past it, the safety cap and its warning at the cap, and the credit allowances and gifts (now by step); the margins, which were computed for the old allowances.

## Amendment 2026-11-14: choosing a plan ends the trial

Decided by Mircea on 2026-11-14.

### What

Choosing a plan during the trial ends the trial at that moment. The checkout charges the plan's first period at once, as it already did after a trial or for a read-only organization: the Stripe subscription has no `trial_end`, and the paid period, the subscription's month and its renewal date start with that payment. The trial's days left are lost. From that first payment the organization has its step's SMS signing codes and AI credits for the month, and the step's welcome credits, as after any first payment.

The first payment is confirmed in the browser (`payment_behavior: 'default_incomplete'`). Until it succeeds the Stripe subscription is `incomplete` and our row does not follow it: the organization stays in its trial, unchanged, with nothing granted. A declined card or a 3-D Secure step left unfinished leaves it there; Stripe expires the incomplete subscription after a day and the owner can try again, the next attempt cancelling the one left behind. When the payment succeeds, the row takes the subscription as `active` and its `trial_ends_at` becomes the subscription's start, the moment the trial ended. The event of the paid invoice may come before the subscription's own; the invoice's handler then reads the subscription from Stripe first, so the welcome credits are always the step's that was paid for. When a paid first invoice can never be adopted, because its subscription was cancelled or superseded by a second checkout, Stripe retries the event until it ends as an error, and no welcome credits are granted for it.

A trial with no plan chosen is unchanged: 14 days, 300 AI credits, signing codes by email, Profesional's limits and features, read-only for 30 days after it ends.

### Why

- It removes the state "plan chosen, not yet paid" and its own rules: SMS up to the chosen step's allowance with a hard stop, the trial's credits until the first payment, the chosen plan's users already counted, cancelling back into the trial, and the texts for each.
- It closes a window in which a trial could send up to 1,000 free SMS signing codes, on Profesional's largest step, and then cancel before anything was charged.
- Keeping the trial's days was meant to make deciding early cost nothing. With the trial at 14 days the days given up are few, and an owner who wants them can wait to choose; the checkout says, before paying, that the payment ends the trial and that its days left are not kept.

### Existing rows

A plan chosen during the trial before this change has a Stripe subscription still `trialing`, charged at the trial's end. Production had none when this was decided, but such rows are handled as they are: the subscription is followed as before, a change applies at once with nothing prorated, and cancelling drops it at once and returns the organization to its plain trial (logged as `plan_canceled_in_trial`). Until its first payment such a row gets what a trial gets: no SMS (unless it is a tester's), the trial's 300 credits and the trial's limits. The Abonament tab names the plan and the day of the first payment and lets the owner drop it; one whose card never confirmed is chosen again through the checkout, which now charges at once.

### What this replaces

In "Plans and the trial": the paragraph on an organization that picks a plan before its trial ends. Under "Limits and usage": "Before the first payment", and in the welcome gift the reasoning about choosing and cancelling before the first charge (the gift still comes with the first payment). In "Plan features": offers after Start is chosen during the trial. In the amendment on plans by employee step: "Before the first payment nothing changes" and the users of a plan chosen during the trial.

## Amendment 2026-11-14: welcome credits fixed at the first payment

Decided by Mircea on 2026-11-14.

At the first successful payment the organization receives 10 welcome AI credits per employee of the step it pays for, at most 10,000, which never expire, as before. That amount never changes afterwards: moving to a higher step or to Profesional gives no more welcome credits, and moving down takes none away. The monthly SMS codes and AI credits still follow the step on a change: an upgrade adds the difference for the month under way.

Topping the gift up on every upgrade let an owner move up for a day, for about 11 €, collect 7,500 credits that never expire, and move back down.

`grant_welcome_gift` grants once per organization and answers 0 afterwards, whatever amount it is asked for, so a webhook delivered again grants nothing twice. Only a paid invoice asks for it. Organizations that already received a gift keep what they have and get nothing more. In "Limits and usage" of the amendment on plans by employee step, this replaces "The welcome credits are brought up to the step's, so moving up after the first payment adds the difference once".

## Amendment 2026-11-14: a month over the step

The pricing page and the Terms (point 8, "Limitele treptei") already promise it: when the active employees of the active clients pass the subscription's step, the organization is told; if after a month it has neither moved up nor come back within the step, it adds no employees, and no clients with employees, until it does; everything in the account keeps working. Step 10 of the order of work named this block and it was not built. This builds it.

### The count and the limit

The count is the Abonament tab's: active employees (`status = 'active'`, not archived) of clients that are clients, not offers, and not archived. The limit is the subscription's step; during a trial, the trial's own limit, Profesional's largest step (5,000), so a trial is never held to a step it has not paid for; a row without a step takes its plan's first. No limit applies, and no clock runs, while the subscription is canceled or the organization read-only: it cannot add employees then anyway, and coming back starts a fresh month if it is still over, never an old one already past. A payment being retried keeps full access, so its clock runs. Enterprise has no step and is never counted. An organization without a subscription row has no limit, as it has full access. The database computes both (`organization_employee_count`, `employee_limit_of`); `usageLimits` in the API's billing rules computes the same limit for the meter, and a test holds the two to the plan catalogue.

### The clock

`subscriptions.employees_over_step_since` holds when the count last went past the limit, and is null while it is within. It is written in the database only, by `refresh_employees_over_step`, which counts and either keeps the time it holds, sets it to now, or clears it; before it moves the clock it locks the subscription row and counts again. It never sets an earlier time, so nothing can backdate a block, and a refusal leaves it alone because a refused write rolls back with it. Triggers call it after every change that can move the count (an employee added, removed, archived or brought back, its status, a move between clients; a client archived, restored or promoted), deferred to the end of the transaction and run once per organization there: an import writes its people one statement at a time, so a refresh per row, or per statement, would count the whole organization once per person. The refusal below does not wait for it, so an import stays all or nothing. A change that can move the limit (plan, step, status, the trial's end, the end of access, a chosen plan) moves the clock in the same write. Each start and each clear goes to `subscription_changes` with source `database`. The lock makes two changes to one organization count one after the other, so neither undoes the other's start.

The limit also moves with time alone when a trial ends. That needs no new scheduled job: the daily run the API already has (its cron at 02:41) refreshes every clock first, and reading the state (`employees_over_step`, which `GET /me` and `GET /billing` call) refreshes that organization's. A clock started late by either is started from that moment, never from the trial's end. Organizations already over when the migration runs start their month then.

Rejected: deriving the start from the change log or from the employees' `created_at` on every read (a clock that a deleted row or an edited date could move), and a timestamp the API writes (the data API lets members write employees directly, so the API is not the only writer).

### The month and the block

The last day new employees can be added is the same calendar day a month after the clock started, in Romanian time, clamped to the month's last day as Stripe's months are (31 January gives 28 February). The block starts when that day ends, at midnight in Bucharest, so the date the app and the email show is a whole day, inclusive. That is the reading of "after a month" most favourable to the customer.

From then, while still over, every write that adds to the count is refused, from a member, with `STP01`, which the API answers as `403` with `reason: employees_over_step`. The check counts live, so a clock left set while the count is within never blocks. What is refused, each by a trigger, so that the data API refuses it too:

- adding an active employee: the form, both imports' confirmations, and a direct insert;
- turning a former employee active again, and bringing back an employee archived as a mistake;
- moving an active employee from a client that is not counted to one that is;
- restoring an archived client that has active employees; one without any comes back as before.

Deleting an organization needs its employees gone first (their foreign key restricts it), and the refresh deferred to the end finds the subscription deleted with the organization and does nothing.

Nothing else is refused: adding a client without employees, recording a former employee, editing, archiving, marking a leaver, documents, trainings, tests and signing. An employee import that only completes people already there confirms; one with new people is refused whole, and a person set aside is left out of a confirmation as before, so the member can set the new ones aside, which are then not created, and confirm the rest. A client import is refused at confirmation when the client comes with employees; starting one is not refused, since a client may come without any, and the upload dialog says so first. A ready import is kept 14 days from its last change. Without a user, under the secret key (seeds, maintenance), nothing is refused.

### Lifting

The block lifts in the write that ends it: a step that covers the count, or a plan or trial whose limit does (the subscription trigger clears the clock in the same update a Stripe webhook makes), or the count dropping to the step or below, by archiving clients, marking leavers or archiving employees entered by mistake. The app names the first two. Going over again later starts a new month.

### What people see and hear

`GET /me` and `GET /billing` carry `employeesOverStep: { since, lastDay, blocked }`, null while within. The employees screen, the new employee form and the two import dialogs show a notice to every member: before the block, until when new employees can be added; after it, that they cannot, why, and what lifts it, with a link to Abonament and, for a member who is not the owner, that the owner changes the step. After the block, the add buttons are disabled with that notice in view. The Abonament tab's notice to the owner names the date. A refused request is worded where it was made.

The owner gets an email when the clock starts and another three days before the last day, each once per clock (`usage_notices`, keyed by the clock's start). The first goes from the request that passed the step and, failing that, from the daily run, which also sends the reminder; both record before sending and take the record back if the send fails, as the SMS notices do. One that finds no owner to send to is not kept as sent either, so it goes out once the organization has an owner again.

### Trials, testers and Enterprise

A trial, a tester's included, is held to its own 5,000 under the same rule; a tester's trial can outlast a month. Choosing a plan in a trial now charges at once and ends the trial, so the plan's step applies from then; a row that chose a plan before that change and still waits for the trial's end is held to its step from the trial's end. Enterprise is never blocked.

## Amendment 2026-11-14: extras with a monthly ceiling

The amendment "plans by employee step" above left extras off for everyone until a screen could turn them on. This builds that screen and the rules behind it. Mircea's decisions of 2026-11-14; the screen is proposal B of the "Extra peste plan" page on the Abonament design canvas, with a ceiling for each kind.

### What the owner turns on

Two kinds, each on its own: **extra signing codes by SMS** at 0.10 € a code, and **extra AI credits** at 1.50 € for each 100. Each has its own **monthly ceiling**, in whole euro, from 1 € to 500 €, without VAT. Off by default. Only the owner in person turns a kind on, changes its ceiling or turns it off; the other members see only whether each kind is on: no ceiling, no amount, and none of the counts it could be worked out from (the extra codes sent, the credits bought or left to buy), so their meters stop at what is included and say extras are in use; an admin impersonating the owner sees the members' view. Lowering a ceiling or turning a kind off works in any state of the subscription; turning on or raising only while extras apply. The field where the ceiling is entered is the confirmation: there is no second step, and turning off asks nothing. A new ceiling, or off, applies at once, for the month already under way; what was used before stays on the next invoice.

- **SMS.** Past the step's codes (and those granted by hand), a code goes on by SMS as long as the month's extra codes, at 0.10 € each, stay within the ceiling: 10 € is 100 codes. At the ceiling, or with extras off, a signer with an email gets the code by email and one without is told to ask their specialist, until the renewal, as at the hard stop. The ceiling counts the extra codes, not all codes, so a higher step or a grant that raises the month's allowance never lets the extras pass it.
- **AI credits.** Sold in **blocks of 100**. The ceiling buys the whole blocks that fit in it, floor(ceiling ÷ 1.50): 10 € is 6 blocks, 600 credits for 9 €; 1 € buys none, which the screen says. A block is bought, and charged, when its first credit is used. The order of use is the month's credits, then the welcome credits, then blocks. What a block leaves unused is used before another is bought and ends with the month, as the month's credits do. An import starts when the month's, the welcome credits and what the ceiling can still buy cover its known part. Past the ceiling, or with extras off, the rules of ADR 030 apply unchanged: a new import waits, and a reading under way may take the balance 150 below zero, made up from the next month. A balance below zero (the 150 a reading may overrun) is never paid off with blocks: a block is bought only for what the charge still needs, its credits are kept apart from the month's, and the shortfall comes off the next month as before. A refund of a charge that used block credits returns them to the month's balance, so in that one case returned block credits can offset a shortfall, and a refund made in a later month arrives as that month's credits; the block stays charged. Credits left in blocks already bought stay usable after extras are turned off or while a payment is overdue, since they are paid for. A refund gives credits back to the balance, never a block back: a block once bought stays charged, and the credits it brought may be used again that month.

### Where it is enforced

Each kind's ceiling lives in `usage_extras`, the service role's alone. The API says only whether extras may apply at all (below); the claim of a signing code and the charge of credits read the ceiling inside their lock per organization, so a request that runs while the owner lowers a ceiling sees the new one, and parallel requests cannot pass it together: with a 1 € SMS ceiling and a 3 € credits ceiling, thirty claims and thirty charges sent at once over thirty connections sent exactly ten extra codes and bought exactly two blocks (measured on 2026-11-14 against the migration on a copy of the local database). Each block is a row of `credit_extra_blocks`, numbered within its month under a unique key.

### When extras apply

Only on a subscription that has paid its first invoice and is `active` (a cancellation set for the end of the period included). Not during a trial, a tester's included, which has nothing to bill them to: the screen says they can be turned on after choosing a plan, and the testers' fixed allowances do not change. Not on Enterprise, which is quoted. While a payment is overdue extras stop, as if off, and the owner's settings stay, so they come back with the payment. When the subscription ends (`canceled`), both kinds are turned off, so a subscription taken out again starts with them off, as any new one does.

- **A change of plan or step** keeps the ceilings: they are in euro, not in a share of the allowance. A higher step's codes and credits count at once, so extras start later in that month.
- **Cancelling** keeps extras until the period paid ends. What was used in the last month is billed on the subscription's final invoice, which a cancellation at the period's end makes (not verified in Stripe yet).
- **A failed payment** stops new extras at once. What was used before stays on the open invoice. If Stripe cancels the subscription after its retries, Stripe cancels at once and discards metered usage not yet invoiced: those extras are not billed, and are our loss (Stripe, "Cancel subscriptions", usage-based billing).
- **Read-only** follows from the above: an ended or overdue subscription has no extras.

### Stripe

Two metered prices, both monthly, on every subscription: `sms_overage_monthly_v2` (0.10 €) on the meter `sms_overage`, as before, and `credits_extra_monthly_v2` (1.50 € for one block) on a meter of its own, `credits_extra_blocks`, product "Credite AI peste cele incluse în plan, câte 100", the line Oblio's invoice shows. Each extra code and each block is one meter event of value 1, with its row's id as Stripe's identifier, reported right after the code is sent or the block bought, and retried by the daily cron for the 35 days Stripe accepts events. Stripe accepts an event after its month's invoice is final and then bills it nowhere, so reporting at once, not later, is what lands it on the invoice; the cron only catches failures.

**Annual plans.** Extras are invoiced monthly on an annual plan too. Stripe allows prices of different intervals on one subscription only in flexible billing mode, which every subscription here already has, since the SMS meter was put on annual plans in phase 2. So the credits price is a second monthly metered item on the same subscription, not a monthly subscription of its own or invoice items: one customer, one subscription, one cancellation, and every extra still on Stripe's usage invoices, which Oblio already turns into fiscal invoices on payment. A month without extras makes a Stripe invoice of zero, which goes no further. Not verified in a sandbox with a real annual subscription: the behaviour rests on Stripe's flexible billing mode and on the SMS item that phase 2 put on annual plans.

New subscriptions get both metered items, and a change set for the renewal keeps them. A subscription made before this amendment has only the SMS item; turning AI extras on adds the credits item first (no proration, idempotent by subscription), since a meter event for a customer without such an item is accepted and billed to nobody. The setup script creates the second meter and price; each metered price is checked against its own meter. A v1 subscription, or one moved from v1, gets the metered item it lacks: a change of plan or step adds any missing one, and turning a kind on adds its own. Turning one on while a change waits for its payment answers `409 extras_pending_payment`, since an items update would discard that change; with a change set for the renewal, the scheduled choice is written on the Stripe subscription's metadata, the schedule released, the item added and the schedule set again with the item in both phases; a failure on the way sets the schedule again before answering, a later attempt finishes what one left half done, and a failure to set it again is logged with the organization and the choice to set by hand. A schedule with nothing still to come is released. Plan changes keep their own release-then-update order, unchanged here. Running it is an operator's step in each account: the sandbox ran it on 2026-11-14; production needs "Configurează Stripe" for production, a dry run and then apply, before this ships, or every checkout answers `stripe_not_set_up`.

### Warnings

The owner gets an email at 80 % of what a ceiling buys and when nothing more fits under it, for each kind, once a month each, in the pattern of the allowance emails; the allowance email at 100 % says that codes go on as extras when SMS extras are on.

### What this replaces

In the amendment "plans by employee step", "Extras": the rule that every organization is off, that nothing can be bought, and the sentence about the SMS cap's unused column, which this drops (`sms_cap_factor`). The safety cap of "Limits and usage" stays gone; the ceiling replaces it.

## Amendment 2026-11-15: the invoice total is the amount charged

Stripe works out the VAT once, on the invoice's subtotal, and spreads it over the lines; Oblio works it out on each line and adds the lines up. On an invoice of several lines the two can differ by a cent: Stripe invoice YZSR1GVQ-0025 charged 343.68 €, and the proforma TEST-0013 made from it said 343.67 €.

Oblio's API takes no VAT amount for a line, only a price, a quantity, the rate and whether the price includes VAT. So a line whose VAT Oblio would not round to Stripe's (or whose VAT is exactly half a cent, which leaves the rounding to Oblio) goes to Oblio as one unit at Stripe's amount with its VAT, `vatIncluded: 1`; every other line goes before VAT, as before. Each line's total is then Stripe's, so the document's total is the amount charged, whatever the shape of the invoice. Oblio splits a line sent with its VAT back into a value and VAT: usually Stripe's own, but when Stripe's VAT for the line is more than about 0.6 cents from 21 % of it, the value and the VAT each move a cent the other way (2 blocks of AI credits, 3.00 € and 0.64 € VAT at Stripe, print 3.01 € and 0.63 €). A metered line sent this way says in its description what it counted, "2 × 1,50 € fără TVA". An extra line that only corrects the total was set aside: it would put an amount on the invoice that is no service.

Before issuing, the lines and their VAT must add up to the Stripe total, or no document is issued and the event fails. After issuing, the document's total is read back from Oblio's list of documents; a difference, or a total that could not be read, is logged as an error and recorded in `subscription_changes` (`oblio_total_mismatch`, `oblio_total_unchecked`) for a person to settle with a storno. Proforma TEST-0015 (2026-11-15) carried the two lines of TEST-0013 and two extras lines, one of each kind, and came to 349.74 €, Stripe's sum. That an invoice mixing the two kinds of line passes e-Factura is not checked yet: non-prod issues no invoices.

## Amendment 2026-11-15: invoicing problems reach the operator

The checks of the amendment above, and Oblio's own failures, left only a log line and a database row: a client could pay and have no invoice with nobody told. The API now posts these to a Discord channel of their own, one per environment (`#facturare-prod`, `#facturare-non-prod`), through the API's secret `DISCORD_BILLING_WEBHOOK`, with the sender the imports' alerts use ([ADR 037](adr-037-import-quality-and-alerts.md)):

- **A paid invoice left without its document**: the lines and their VAT do not make the amount charged, the company details are missing, or Oblio refused or could not be reached. A first invoice already issued while it waits for its subscription is not one.
- **A document whose total differs** from the amount charged, or **whose total could not be read back** (`oblio_total_mismatch`, `oblio_total_unchecked`).
- **A failed payment** of a renewal or a change, once per invoice, not on each of Stripe's retries; the first charge of a new subscription fails in the browser and is not posted.
- **A subscription Stripe cancelled** after its retries failed (`cancellation_details.reason` `payment_failed`); an owner's cancellation is not posted.

A message says what happened, the environment, the organization's name and id, the Stripe invoice's number and id with a link to it in Stripe's dashboard, the totals, the Oblio series and number when a document exists, and what to do. It carries no email address and no card details; a failure's text has its email addresses masked. Unlike the imports' alerts it names the organization, so that the operator knows whom to invoice by hand; a PFA's or II's name is a person's.

Each problem is posted once per Stripe invoice or subscription: a row `operator_alerted` in `subscription_changes`, written only after Discord took the post, keeps Stripe's retries of the same event quiet and lets a post lost while Discord was down go out on the next retry. The post runs after the response and never fails or delays the event; without the secret nothing is posted. An invoice still without a document when Stripe stops retrying, after three days, is not posted again.
