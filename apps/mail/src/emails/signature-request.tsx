import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type SignatureRequestProps = {
  count: number;
  organizationName: string;
  signUrl: string;
  place: 'portal' | 'app';
};

export function trainingsToSign(count: number) {
  if (count === 1) return 'o instruire';
  const tail = count % 100;
  return tail === 0 || tail >= 20 ? `${count} de instruiri` : `${count} instruiri`;
}

export const subject = (count: number) => `Ai ${trainingsToSign(count)} de semnat în SSM Ușor`;

// A count and no list: what is signed is shown after the sign-in, not in a mailbox.
export default function SignatureRequest({
  count,
  organizationName,
  signUrl,
  place,
}: SignatureRequestProps) {
  const one = count === 1;
  const where = place === 'portal' ? 'în portalul SSM Ușor' : 'în SSM Ușor';
  return (
    <Layout
      preview={`${organizationName} îți cere semnătura pe ${trainingsToSign(count)}.`}
      reason={`Ai primit acest email pentru că ${organizationName} te-a trecut ca semnatar pe fișe de instruire pe care le ține în SSM Ușor.`}
    >
      <Title>{`Ai ${trainingsToSign(count)} de semnat`}</Title>
      <Paragraph>
        {`${organizationName} a înregistrat ${one ? 'o instruire care îți cere' : 'instruiri care îți cer'} semnătura. ${one ? 'O vezi și o semnezi' : 'Le vezi și le semnezi'} ${where}.`}
      </Paragraph>
      <Paragraph>
        La semnare îți trimitem un cod de unică folosință, pe care îl introduci ca să confirmi că tu
        semnezi. Dacă ceva din listă nu e corect, nu semna și spune-i specialistului.
      </Paragraph>
      <Action href={signUrl}>
        {place === 'portal' ? 'Deschide portalul' : 'Deschide SSM Ușor'}
      </Action>
      <FallbackLink href={signUrl} />
    </Layout>
  );
}

SignatureRequest.PreviewProps = {
  count: 7,
  organizationName: 'Protect SSM Consult',
  signUrl: 'https://portal.ssmusor.ro',
  place: 'portal',
} satisfies SignatureRequestProps;
