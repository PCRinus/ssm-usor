# Mail Worker

`apps/mail` renders and sends every email SSM Ușor produces. [ADR 002](architecture/adr-002-transactional-email.md)
records why it is a separate Worker and why Resend delivers the email.

It has no route and no public hostname. Other Workers call it through a service binding; its
methods are described by the `MailService` interface in `packages/contracts`, which the mail
Worker implements and callers use to type their binding.

| Method                     | Email                                                        |
| -------------------------- | ------------------------------------------------------------ |
| `sendWaitlistConfirmation` | Asks a waitlist subscriber to confirm their address by link. |

Every method validates its input, renders the template, hands the result to the provider, and
resolves with `{ id }`, the provider's message id. It rejects when the provider refuses the
email, so the caller decides how to report the failure.

## Source layout

```text
apps/mail/src/
  index.tsx               WorkerEntrypoint with one method per email
  send.ts                 render to HTML and plain text, then hand to the provider
  theme.ts                brand palette, fonts, and logo URL as plain values
  emails/                 one React Email template per file
  emails/_components/     shared layout, title, paragraph, button, fallback link
  provider/index.ts       picks the provider; the only place that knows about Resend
  provider/resend.ts      Resend REST call
  provider/log.ts         prints the email when no API key is configured
```

## Writing a template

1. Add `emails/<name>.tsx`. Export the component as the default export, its `subject`, and
   `PreviewProps` with sample data for the preview server.
2. Build it from the shared components in `emails/_components` so every email keeps the same
   frame; the underscore keeps that folder out of the preview server's list. Use inline styles
   with values from `theme.ts`; email clients ignore CSS variables, flexbox, grid, and most
   media queries. Do not use React Email's Tailwind component.
3. Write the copy in Romanian and address the reader as "tu", like the marketing site.
4. Add the payload schema and the method to `MailService` in `packages/contracts/src/mail.ts`,
   then implement the method in `index.tsx`.
5. Cover it in a test that renders it through `sendEmail` with a stub provider.

Images must be PNG or JPEG at an absolute URL. The logo is
`apps/marketing/public/brand/logo-email.png`, a 450 px wide copy of the brand logo served from
`https://ssmusor.ro/brand/logo-email.png`. Its wordmark is dark, so keep it on the white card.

## Local development

```bash
pnpm dev:emails   # React Email preview at http://localhost:3001
pnpm dev:mail     # the Worker itself, on port 8788
```

The preview server is the way to look at a template while editing it. `pnpm dev:mail` matters
once another Worker calls the binding: run it next to `pnpm dev:api` and Wrangler connects the
two local Workers on its own.

Without `RESEND_API_KEY` the Worker prints each email to the console instead of sending it.
To send real email locally, copy `apps/mail/.dev.vars.example` to `.dev.vars` and set a key.

## Configuration

| Name             | Kind   | Value                                                 |
| ---------------- | ------ | ----------------------------------------------------- |
| `MAIL_FROM`      | var    | `SSM Ușor <noreply@mail.ssmusor.ro>`                  |
| `MAIL_REPLY_TO`  | var    | `contact@ssmusor.ro`                                  |
| `RESEND_API_KEY` | secret | A Resend key with sending access; optional, see below |

Both vars live in `apps/mail/wrangler.jsonc`.

## Going live with Resend

1. Create a Resend account and add the domain `mail.ssmusor.ro`.
2. Add the DKIM, SPF, and MX records Resend shows to the `ssmusor.ro` zone in Cloudflare, with
   the proxy off. They all sit under `mail.ssmusor.ro`, so the records that serve
   `contact@ssmusor.ro` are untouched.
3. Add a DMARC record if the zone has none: a TXT record at `_dmarc.ssmusor.ro` with
   `v=DMARC1; p=none; rua=mailto:contact@ssmusor.ro`. Tighten the policy once reports look clean.
4. Create an API key limited to sending and save it as the `RESEND_API_KEY` secret of the
   `production` GitHub environment.
5. Re-run the mail deployment. Until the secret exists, the deployment warns and the Worker
   only logs.

## Deployment

The mail Worker deploys from `main` like the other applications; see the [CI/CD guide](ci-cd.md).
`pnpm deploy:mail` publishes it from a machine that is logged in to Wrangler.
