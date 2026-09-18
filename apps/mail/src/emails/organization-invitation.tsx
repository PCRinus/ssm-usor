import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type OrganizationInvitationProps = {
  acceptUrl: string;
  organizationName: string;
  /** Null when the person who invited has no profile name. */
  inviterName: string | null;
  /** ISO timestamp after which the link stops working. */
  expiresAt: string;
};

export const subject = (organizationName: string) => `Invitație în ${organizationName} pe SSM Ușor`;

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
});

// One email for people with and without an account, so the action does not say "create".
export default function OrganizationInvitation({
  acceptUrl,
  organizationName,
  inviterName,
  expiresAt,
}: OrganizationInvitationProps) {
  return (
    <Layout
      preview={`${inviterName ?? organizationName} te invită în SSM Ușor.`}
      reason={`Ai primit acest email pentru că un administrator al organizației ${organizationName} a introdus adresa ta în SSM Ușor. Dacă nu te aștepți la această invitație, îl poți ignora: fără acceptare nu se creează niciun cont.`}
    >
      <Title>Alătură-te echipei {organizationName}</Title>
      <Paragraph>
        {inviterName
          ? `${inviterName} te invită să lucrați împreună în SSM Ușor, în organizația ${organizationName}.`
          : `Ai primit o invitație în organizația ${organizationName} din SSM Ușor.`}
      </Paragraph>
      <Paragraph>
        Acceptă invitația ca să îți creezi contul sau, dacă ai deja unul, să intri în organizație.
        Linkul este valabil până pe {dateFormat.format(new Date(expiresAt))}.
      </Paragraph>
      <Action href={acceptUrl}>Acceptă invitația</Action>
      <FallbackLink href={acceptUrl} />
    </Layout>
  );
}

OrganizationInvitation.PreviewProps = {
  acceptUrl: 'https://app.ssmusor.ro/accept-invitation?token=exemplu',
  organizationName: 'Protect SSM Consult',
  inviterName: 'Ana Popescu',
  expiresAt: '2026-09-25T12:00:00.000Z',
} satisfies OrganizationInvitationProps;
