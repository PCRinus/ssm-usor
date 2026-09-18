import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type WaitlistConfirmationProps = { confirmUrl: string };

export const subject = 'Confirmă abonarea la noutățile SSM Ușor';

export default function WaitlistConfirmation({ confirmUrl }: WaitlistConfirmationProps) {
  return (
    <Layout
      preview="Un singur clic și îți scriem când se deschid conturile."
      reason="Ai primit acest email pentru că cineva a introdus adresa ta pe ssmusor.ro. Dacă nu ai fost tu, îl poți ignora: fără confirmare nu îți mai scriem."
    >
      <Title>Confirmă adresa de email</Title>
      <Paragraph>
        Ai cerut să primești un email când se deschid conturile SSM Ușor. Confirmă adresa și te
        trecem pe listă.
      </Paragraph>
      <Action href={confirmUrl}>Confirmă abonarea</Action>
      <FallbackLink href={confirmUrl} />
    </Layout>
  );
}

WaitlistConfirmation.PreviewProps = {
  confirmUrl: 'https://api.ssmusor.ro/waitlist/confirm?token=exemplu',
} satisfies WaitlistConfirmationProps;
