import type { CSSProperties } from 'react';
import { Text } from 'react-email';

import { color } from '../theme';
import { Layout } from './_components/layout';
import { Paragraph, Title } from './_components/text';
import { validity } from './_components/validity';

export type SigningCodeProps = {
  code: string;
  expiresInMinutes: number;
};

// The code in the subject can be read from the notification, without opening the email.
export const subject = (code: string) => `Codul tău de semnare SSM Ușor: ${code}`;

export default function SigningCode({ code, expiresInMinutes }: SigningCodeProps) {
  return (
    <Layout
      preview={`Codul tău de semnare este ${code}.`}
      reason="Ai primit acest email pentru că cineva a cerut în SSM Ușor un cod de semnare pentru această adresă. Dacă nu ai fost tu, nu face nimic: fără cod nu se semnează nimic."
    >
      <Title>Codul tău de semnare</Title>
      <Paragraph>
        Introdu codul de mai jos în ecranul de semnare din SSM Ușor. Cu el semnezi documentele pe
        care le-ai văzut în listă înainte de a cere codul.
      </Paragraph>
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

SigningCode.PreviewProps = {
  code: '493027',
  expiresInMinutes: 10,
} satisfies SigningCodeProps;
