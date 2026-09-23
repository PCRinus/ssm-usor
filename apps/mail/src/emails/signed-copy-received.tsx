import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type SignedCopyReceivedProps = {
  clientName: string;
  contractNumber: number;
  /** ISO date. */
  contractDate: string;
  leadUrl: string;
};

export const subject = (clientName: string) => `Exemplar semnat primit – ${clientName}`;

const printedDate = (isoDate: string) => isoDate.split('-').reverse().join('.');

// To the owner who sent a contract: the copy is in the app, waiting to be looked at.
export default function SignedCopyReceived({
  clientName,
  contractNumber,
  contractDate,
  leadUrl,
}: SignedCopyReceivedProps) {
  return (
    <Layout
      preview={`${clientName} a trimis exemplarul semnat al contractului nr. ${contractNumber}.`}
      reason="Ai primit acest email pentru că ai trimis un contract din SSM Ușor și exemplarul semnat s-a întors prin linkul din email."
    >
      <Title>Exemplarul semnat a sosit</Title>
      <Paragraph>
        {`${clientName} a trimis exemplarul semnat al contractului nr. ${contractNumber} din ${printedDate(contractDate)}, prin linkul din emailul tău.`}
      </Paragraph>
      <Paragraph>
        Deschide-l pe pagina clientului potențial și confirmă-l, ca să apară drept semnat. Până
        atunci, contractul nu este socotit semnat.
      </Paragraph>
      <Action href={leadUrl}>Vezi exemplarul primit</Action>
      <FallbackLink href={leadUrl} />
    </Layout>
  );
}

SignedCopyReceived.PreviewProps = {
  clientName: 'S.C. Gelateria Florești S.R.L.',
  contractNumber: 52,
  contractDate: '2026-09-21',
  leadUrl: 'https://app.ssmusor.ro/leads/00000000-0000-4000-8000-000000000000',
} satisfies SignedCopyReceivedProps;
