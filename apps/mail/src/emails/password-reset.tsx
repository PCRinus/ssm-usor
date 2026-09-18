import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type PasswordResetProps = {
  resetUrl: string;
  /** How long the link works, as configured in Supabase Auth. */
  expiresInMinutes: number;
};

export const subject = 'Resetează parola contului SSM Ușor';

// "60 de minute" reads worse than "o oră"; whole hours are what the setting holds in practice.
function validity(minutes: number) {
  if (minutes === 60) return 'o oră';
  if (minutes % 60 === 0) return `${minutes / 60} ore`;
  return minutes < 20 ? `${minutes} minute` : `${minutes} de minute`;
}

export default function PasswordReset({ resetUrl, expiresInMinutes }: PasswordResetProps) {
  return (
    <Layout
      preview="Alege o parolă nouă pentru contul tău."
      reason="Ai primit acest email pentru că cineva a cerut resetarea parolei pentru contul SSM Ușor cu această adresă. Dacă nu ai fost tu, îl poți ignora: parola rămâne neschimbată."
    >
      <Title>Alege o parolă nouă</Title>
      <Paragraph>
        Am primit o cerere de resetare a parolei pentru contul tău SSM Ușor. Deschide linkul de mai
        jos și alege o parolă nouă.
      </Paragraph>
      <Action href={resetUrl}>Resetează parola</Action>
      <Paragraph>
        Linkul este valabil {validity(expiresInMinutes)} și poate fi folosit o singură dată.
      </Paragraph>
      <FallbackLink href={resetUrl} />
    </Layout>
  );
}

PasswordReset.PreviewProps = {
  resetUrl: 'https://app.ssmusor.ro/reset-password?token_hash=exemplu',
  expiresInMinutes: 60,
} satisfies PasswordResetProps;
