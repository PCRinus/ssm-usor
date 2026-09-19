import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';
import { validity } from './_components/validity';

export type SignupConfirmationProps = {
  confirmUrl: string;
  expiresInMinutes: number;
};

export const subject = 'Confirmă adresa de email pentru contul SSM Ușor';

export default function SignupConfirmation({
  confirmUrl,
  expiresInMinutes,
}: SignupConfirmationProps) {
  return (
    <Layout
      preview="Un clic și contul tău SSM Ușor este gata."
      reason="Ai primit acest email pentru că cineva a creat un cont SSM Ușor cu această adresă. Dacă nu ai fost tu, îl poți ignora: fără confirmare contul nu poate fi folosit."
    >
      <Title>Confirmă adresa de email</Title>
      <Paragraph>
        Bine ai venit în SSM Ușor. Confirmă adresa de email, apoi îți configurezi organizația și
        poți începe lucrul.
      </Paragraph>
      <Action href={confirmUrl}>Confirmă adresa</Action>
      <Paragraph>
        Linkul este valabil {validity(expiresInMinutes)} și poate fi folosit o singură dată.
      </Paragraph>
      <FallbackLink href={confirmUrl} />
    </Layout>
  );
}

SignupConfirmation.PreviewProps = {
  confirmUrl: 'https://app.ssmusor.ro/confirm-email?token_hash=exemplu',
  expiresInMinutes: 60,
} satisfies SignupConfirmationProps;
