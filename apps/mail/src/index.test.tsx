import type { MailReceipt } from '@ssm-usor/contracts/mail';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EmployeesOverStepNotice from './emails/employees-over-step-notice';
import ExtrasNotice from './emails/extras-notice';
import OrganizationInvitation from './emails/organization-invitation';
import ParticipantInvitation from './emails/participant-invitation';
import PasswordChanged from './emails/password-changed';
import PasswordReset from './emails/password-reset';
import ServiceContract from './emails/service-contract';
import SignInCode from './emails/sign-in-code';
import SignatureRequest from './emails/signature-request';
import SignedCopyReceived from './emails/signed-copy-received';
import SigningCode from './emails/signing-code';
import SignupConfirmation from './emails/signup-confirmation';
import SmsUsageNotice from './emails/sms-usage-notice';
import WaitlistConfirmation from './emails/waitlist-confirmation';
import { Mail } from './index';
import type { OutgoingEmail } from './provider';
import type { Message } from './send';
import { sentEmail, testEnv } from './testing';

const sent = vi.hoisted((): OutgoingEmail[] => []);

vi.mock('./provider', () => ({
  createProvider: () => ({
    send: async (email: OutgoingEmail) => (sent.push(email), { id: 'msg_1' }),
  }),
}));

// Only the Workers runtime provides this module.
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown
    ) {}
  },
}));

const to = 'ion@example.ro';

const cases: { method: keyof Mail; send: (mail: Mail) => Promise<MailReceipt>; email: Message }[] =
  [
    {
      method: 'sendWaitlistConfirmation',
      send: (mail) =>
        mail.sendWaitlistConfirmation({ to, confirmUrl: 'https://api.ssmusor.ro/confirm?t=1' }),
      email: {
        to,
        subject: 'Confirmă abonarea la noutățile SSM Ușor',
        body: <WaitlistConfirmation confirmUrl="https://api.ssmusor.ro/confirm?t=1" />,
      },
    },
    {
      method: 'sendOrganizationInvitation',
      send: (mail) =>
        mail.sendOrganizationInvitation({
          to,
          acceptUrl: 'https://app.ssmusor.ro/invitatie?token=abc',
          organizationName: 'Protect SSM',
          inviterName: 'Olga Popescu',
          expiresAt: '2026-09-25T21:30:00.000Z',
        }),
      email: {
        to,
        subject: 'Invitație în Protect SSM pe SSM Ușor',
        body: (
          <OrganizationInvitation
            acceptUrl="https://app.ssmusor.ro/invitatie?token=abc"
            organizationName="Protect SSM"
            inviterName="Olga Popescu"
            expiresAt="2026-09-25T21:30:00.000Z"
          />
        ),
      },
    },
    {
      method: 'sendPasswordReset',
      send: (mail) =>
        mail.sendPasswordReset({
          to,
          resetUrl: 'https://app.ssmusor.ro/resetare-parola?token_hash=abc',
          expiresInMinutes: 60,
        }),
      email: {
        to,
        subject: 'Resetează parola contului SSM Ușor',
        body: (
          <PasswordReset
            resetUrl="https://app.ssmusor.ro/resetare-parola?token_hash=abc"
            expiresInMinutes={60}
          />
        ),
      },
    },
    {
      method: 'sendPasswordChanged',
      send: (mail) =>
        mail.sendPasswordChanged({
          to,
          forgotPasswordUrl: 'https://app.ssmusor.ro/parola-uitata',
        }),
      email: {
        to,
        subject: 'Parola contului tău SSM Ușor a fost schimbată',
        body: <PasswordChanged forgotPasswordUrl="https://app.ssmusor.ro/parola-uitata" />,
      },
    },
    {
      method: 'sendSignupConfirmation',
      send: (mail) =>
        mail.sendSignupConfirmation({
          to,
          confirmUrl: 'https://app.ssmusor.ro/confirmare-email?token_hash=abc',
          expiresInMinutes: 60,
        }),
      email: {
        to,
        subject: 'Confirmă adresa de email pentru contul SSM Ușor',
        body: (
          <SignupConfirmation
            confirmUrl="https://app.ssmusor.ro/confirmare-email?token_hash=abc"
            expiresInMinutes={60}
          />
        ),
      },
    },
    {
      method: 'sendServiceContract',
      send: (mail) =>
        mail.sendServiceContract({
          to: 'andrei@gelateria.example',
          senderEmail: 'olga@exemplu.example',
          senderName: 'Olga Popescu',
          organizationName: 'S.C. Exemplu SSM S.R.L.',
          clientName: 'S.C. Gelateria Florești S.R.L.',
          contractNumber: 52,
          contractDate: '2026-09-21',
          note: null,
          returnUrl: 'https://app.ssmusor.ro/contract?token=abc',
          attachment: { fileName: 'Contract nr. 52.pdf', contentBase64: 'JVBERi0=' },
        }),
      email: {
        to: 'andrei@gelateria.example',
        subject: 'Contract de prestări servicii – S.C. Exemplu SSM S.R.L.',
        body: (
          <ServiceContract
            senderEmail="olga@exemplu.example"
            senderName="Olga Popescu"
            organizationName="S.C. Exemplu SSM S.R.L."
            clientName="S.C. Gelateria Florești S.R.L."
            contractNumber={52}
            contractDate="2026-09-21"
            note={null}
            returnUrl="https://app.ssmusor.ro/contract?token=abc"
          />
        ),
        sender: { name: 'Olga Popescu', email: 'olga@exemplu.example' },
        from: testEnv.MAIL_FROM_CONTRACTS,
        attachments: [{ fileName: 'Contract nr. 52.pdf', contentBase64: 'JVBERi0=' }],
      },
    },
    {
      method: 'sendSignedCopyReceived',
      send: (mail) =>
        mail.sendSignedCopyReceived({
          to,
          clientName: 'S.C. Gelateria Florești S.R.L.',
          contractNumber: 52,
          contractDate: '2026-09-21',
          leadUrl: 'https://app.ssmusor.ro/oferte/lead-1',
        }),
      email: {
        to,
        subject: 'Exemplar semnat primit – S.C. Gelateria Florești S.R.L.',
        body: (
          <SignedCopyReceived
            clientName="S.C. Gelateria Florești S.R.L."
            contractNumber={52}
            contractDate="2026-09-21"
            leadUrl="https://app.ssmusor.ro/oferte/lead-1"
          />
        ),
      },
    },
    {
      method: 'sendParticipantInvitation',
      send: (mail) =>
        mail.sendParticipantInvitation({
          to,
          clientName: 'Fabrica Sigma SRL',
          organizationName: 'Protect SSM',
          portalUrl: 'https://portal.ssmusor.ro',
        }),
      email: {
        to,
        subject: 'Invitație în portalul SSM Ușor – Fabrica Sigma SRL',
        body: (
          <ParticipantInvitation
            clientName="Fabrica Sigma SRL"
            organizationName="Protect SSM"
            portalUrl="https://portal.ssmusor.ro"
          />
        ),
      },
    },
    {
      method: 'sendSignInCode',
      send: (mail) => mail.sendSignInCode({ to, code: '493027', expiresInMinutes: 60 }),
      email: {
        to,
        subject: 'Codul tău de conectare SSM Ușor: 493027',
        body: <SignInCode code="493027" expiresInMinutes={60} />,
      },
    },
    {
      method: 'sendSigningCode',
      send: (mail) => mail.sendSigningCode({ to, code: '123456', expiresInMinutes: 10 }),
      email: {
        to,
        subject: 'Codul tău de semnare SSM Ușor: 123456',
        body: <SigningCode code="123456" expiresInMinutes={10} />,
      },
    },
    {
      method: 'sendSignatureRequest',
      send: (mail) =>
        mail.sendSignatureRequest({
          to,
          count: 7,
          organizationName: 'Protect SSM',
          signUrl: 'https://portal.ssmusor.ro',
          place: 'portal',
        }),
      email: {
        to,
        subject: 'Ai 7 instruiri de semnat în SSM Ușor',
        body: (
          <SignatureRequest
            count={7}
            organizationName="Protect SSM"
            signUrl="https://portal.ssmusor.ro"
            place="portal"
          />
        ),
      },
    },
    {
      method: 'sendSmsUsageNotice',
      send: (mail) =>
        mail.sendSmsUsageNotice({
          to,
          kind: 'sms_80',
          organizationName: 'Prevenire Plus SRL',
          planName: 'Profesional',
          billed: true,
          used: 240,
          included: 300,
          cap: 400,
          overageCents: 10,
          periodStart: '2026-10-14T08:00:00.000Z',
          periodEnd: '2026-11-14T08:00:00.000Z',
          subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
        }),
      email: {
        to,
        subject: 'Ai folosit 240 din cele 300 de coduri SMS ale lunii',
        body: (
          <SmsUsageNotice
            kind="sms_80"
            organizationName="Prevenire Plus SRL"
            planName="Profesional"
            billed
            used={240}
            included={300}
            cap={400}
            overageCents={10}
            periodStart="2026-10-14T08:00:00.000Z"
            periodEnd="2026-11-14T08:00:00.000Z"
            subscriptionUrl="https://app.ssmusor.ro/organizatie/abonament"
          />
        ),
      },
    },
    {
      method: 'sendEmployeesOverStepNotice',
      send: (mail) =>
        mail.sendEmployeesOverStepNotice({
          to,
          kind: 'employees_over',
          organizationName: 'Prevenire Plus SRL',
          employees: 262,
          limit: 250,
          lastDay: '2026-12-14',
          subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
        }),
      email: {
        to,
        subject: 'Ai mai mulți lucrători decât treapta abonamentului',
        body: (
          <EmployeesOverStepNotice
            kind="employees_over"
            organizationName="Prevenire Plus SRL"
            employees={262}
            limit={250}
            lastDay="2026-12-14"
            subscriptionUrl="https://app.ssmusor.ro/organizatie/abonament"
          />
        ),
      },
    },
    {
      method: 'sendExtrasNotice',
      send: (mail) =>
        mail.sendExtrasNotice({
          to,
          kind: 'sms',
          level: 'near',
          organizationName: 'Prevenire Plus SRL',
          ceilingCents: 1000,
          spentCents: 800,
          used: 80,
          limit: 100,
          periodEnd: '2026-12-01T08:00:00.000Z',
          subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
        }),
      email: {
        to,
        subject: 'Ai trimis 80 din cele 100 de coduri SMS extra ale plafonului',
        body: (
          <ExtrasNotice
            kind="sms"
            level="near"
            organizationName="Prevenire Plus SRL"
            ceilingCents={1000}
            spentCents={800}
            used={80}
            limit={100}
            periodEnd="2026-12-01T08:00:00.000Z"
            subscriptionUrl="https://app.ssmusor.ro/organizatie/abonament"
          />
        ),
      },
    },
  ];

const mail = () => new Mail({} as ExecutionContext, testEnv);

beforeEach(() => {
  sent.length = 0;
});

describe('the Mail entrypoint', () => {
  it('has a case below for every method', () => {
    const methods = Object.getOwnPropertyNames(Mail.prototype).filter(
      (name) => name !== 'constructor'
    );
    expect(cases.map(({ method }) => method).sort()).toEqual(methods.sort());
  });

  it.each(cases)('$method sends its own subject and body', async ({ send, email }) => {
    expect(await send(mail())).toEqual({ id: 'msg_1' });
    expect(sent).toEqual([await sentEmail(email)]);
  });

  it('refuses input its schema rejects, before sending anything', async () => {
    await expect(
      mail().sendPasswordReset({
        to: 'not an address',
        resetUrl: 'https://app.ssmusor.ro/resetare-parola?token_hash=abc',
        expiresInMinutes: 60,
      })
    ).rejects.toThrow();
    expect(sent).toEqual([]);
  });
});
