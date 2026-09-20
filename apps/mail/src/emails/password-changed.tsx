import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type PasswordChangedProps = {
  forgotPasswordUrl: string;
};

export const subject = 'Parola contului tău SSM Ușor a fost schimbată';

// A notice, not a request: the change already happened. What matters is the way out for someone
// who did not make it, so that is the one link.
export default function PasswordChanged({ forgotPasswordUrl }: PasswordChangedProps) {
  return (
    <Layout
      preview="Dacă nu ai schimbat tu parola, resetează-o acum."
      reason="Ai primit acest email pentru că parola contului SSM Ușor cu această adresă a fost schimbată. Îl trimitem la fiecare schimbare, ca titularul contului să afle chiar dacă nu a făcut-o el."
    >
      <Title>Parola ta a fost schimbată</Title>
      <Paragraph>
        Parola contului tău SSM Ușor a fost schimbată de curând. Dacă tu ai făcut schimbarea, nu
        trebuie să faci nimic.
      </Paragraph>
      <Paragraph>
        Dacă nu ai fost tu, cineva are acces la contul tău. Resetează parola chiar acum și scrie-ne
        la contact@ssmusor.ro.
      </Paragraph>
      <Action href={forgotPasswordUrl}>Resetează parola</Action>
      <FallbackLink href={forgotPasswordUrl} />
    </Layout>
  );
}

PasswordChanged.PreviewProps = {
  forgotPasswordUrl: 'https://app.ssmusor.ro/forgot-password',
} satisfies PasswordChangedProps;
