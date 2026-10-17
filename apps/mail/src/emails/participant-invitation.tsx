import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type ParticipantInvitationProps = {
  clientName: string;
  organizationName: string;
  portalUrl: string;
};

export const subject = (clientName: string) => `Invitație în portalul SSM Ușor – ${clientName}`;

// No token in the link: the address this email came to is what the person signs in with.
export default function ParticipantInvitation({
  clientName,
  organizationName,
  portalUrl,
}: ParticipantInvitationProps) {
  return (
    <Layout
      preview={`${organizationName} te invită în portalul SSM Ușor.`}
      reason={`Ai primit acest email pentru că ${organizationName}, care se ocupă de securitatea muncii la ${clientName}, a introdus adresa ta în SSM Ușor. Dacă nu te aștepți la această invitație, îl poți ignora.`}
    >
      <Title>Ai acces la portalul SSM Ușor</Title>
      <Paragraph>
        {`${organizationName}, care se ocupă de securitatea și sănătatea în muncă la ${clientName}, te invită în portalul SSM Ușor. Acolo vezi ce te privește: instruirile tale și fișele lor.`}
      </Paragraph>
      <Paragraph>
        Intră cu adresa la care a sosit acest email. Îți trimitem pe ea un cod de unică folosință,
        pe care îl introduci în portal; nu ai nevoie de parolă.
      </Paragraph>
      <Action href={portalUrl}>Deschide portalul</Action>
      <FallbackLink href={portalUrl} />
    </Layout>
  );
}

ParticipantInvitation.PreviewProps = {
  clientName: 'Fabrica de Mobilă Sigma SRL',
  organizationName: 'Protect SSM Consult',
  portalUrl: 'https://portal.ssmusor.ro',
} satisfies ParticipantInvitationProps;
