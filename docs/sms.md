# SMS Worker

`apps/sms` sends every text message SSM Ușor produces, through Twilio.
[ADR 022](architecture/adr-022-participants-and-the-portal.md) records why it is a Worker of its
own: it holds the Twilio credentials and can do nothing else, and Supabase holds none.

It has no route and no public hostname. The API calls it through the `SMS` service binding; its
methods are described by the `SmsService` interface in `packages/contracts/src/sms.ts`.

| Method                      | Message                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sendParticipantInvitation` | Who invited the participant (the organization and the client), the portal's address, and to sign in with this number. |
| `sendSignInCode`            | The portal's one-time code, how long it works, and that nobody from SSM Ușor will ask for it.                         |

Each method validates its input, writes the text, hands it to the provider and resolves with
`{ id }`, Twilio's message SID. It rejects when Twilio refuses the message, so the caller decides
how to report the failure.

## The text

`src/messages.ts` writes both messages, and its tests hold them to two rules:

- **One GSM-7 segment.** No diacritics and nothing outside GSM-7's basic set, at most 160
  characters. A single `ș` sends the whole message as UCS-2, 70 characters a segment, at two or
  three times the price. Names are transliterated (`Mobilă Ș.A.` becomes `Mobila S.A.`) and,
  when the two together do not fit, shortened evenly, the shorter one giving its spare room to
  the longer.
- **Romanian for a +40 number, English for any other.** The country code stands in for the
  person's language until the portal gets a second language.

## Providers

| Provider | When                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `SMS_FROM` are all set              |
| `log`    | Otherwise: the message is printed to the console and the receipt's `id` is `null` |

The Twilio provider posts to the account's `Messages.json` with Basic authentication. A
`SMS_FROM` that is a Messaging Service SID (`MG…`) is sent as `MessagingServiceSid`, anything else
as `From`. A message created as `queued`, `accepted`, `scheduled`, `sending` or `sent` counts as
handed over; any other status, or an error response, rejects with Twilio's code and message.
Delivery itself is not tracked.

## Local development

```bash
pnpm dev:sms   # the Worker, on port 8793
```

`pnpm dev` and `pnpm dev:local` start it beside the API, which reaches it through Wrangler's dev
registry. Without the Twilio settings it logs each message. To send real messages locally, copy
`apps/sms/.dev.vars.example` to `.dev.vars` and fill in all three.

## Going live with Twilio

1. Create a Twilio account and upgrade it from trial, which only texts verified numbers.
2. Register the alphanumeric sender `SSMUsor` for Romania where Twilio asks for it, or use a
   Twilio number or a Messaging Service for countries that refuse alphanumeric senders. Check
   delivery to a new country with its first participant rather than promising it.
3. Save `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `SMS_FROM` as secrets of the `production`
   GitHub environment, then re-run the SMS deployment. Until all three exist, the deployment
   warns and the Worker only logs.

The Send SMS hook that hands the API each sign-in code is described in the
[API guide](api.md#supabase-auth-sms); its secret, `SUPABASE_AUTH_SMS_HOOK_SECRET`, belongs to the
API and the Supabase configuration, not to this Worker.
