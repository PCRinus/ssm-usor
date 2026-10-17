import type { CSSProperties } from 'react';
import { Text } from 'react-email';

import { color } from '../theme';
import { Layout } from './_components/layout';
import { Paragraph, Title } from './_components/text';
import { validity } from './_components/validity';

export type SignInCodeProps = {
  code: string;
  expiresInMinutes: number;
};

// The code in the subject can be read from the notification, without opening the email.
export const subject = (code: string) => `Codul tău de conectare SSM Ușor: ${code}`;

export default function SignInCode({ code, expiresInMinutes }: SignInCodeProps) {
  return (
    <Layout
      preview={`Codul tău de conectare este ${code}.`}
      reason="Ai primit acest email pentru că cineva a cerut un cod de conectare în portalul SSM Ușor pentru această adresă. Dacă nu ai fost tu, îl poți ignora: fără cod nu se poate intra în cont."
    >
      <Title>Codul tău de conectare</Title>
      <Paragraph>Introdu codul de mai jos în pagina de conectare a portalului SSM Ușor.</Paragraph>
      <Text style={codeStyle}>{code}</Text>
      <Paragraph>
        {`Codul este valabil ${validity(expiresInMinutes)} și poate fi folosit o singură dată. Nu îl da nimănui: nimeni de la SSM Ușor nu ți-l va cere.`}
      </Paragraph>
    </Layout>
  );
}

const codeStyle: CSSProperties = {
  margin: '4px 0 20px',
  padding: '14px 0',
  borderRadius: '10px',
  backgroundColor: color.cream,
  border: `1px solid ${color.border}`,
  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: '32px',
  lineHeight: '40px',
  fontWeight: 600,
  letterSpacing: '8px',
  textAlign: 'center',
  color: color.forest,
};

SignInCode.PreviewProps = {
  code: '493027',
  expiresInMinutes: 60,
} satisfies SignInCodeProps;
