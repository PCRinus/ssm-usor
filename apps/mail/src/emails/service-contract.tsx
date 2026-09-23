import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type ServiceContractProps = {
  senderName: string | null;
  /** Where a reply lands, printed so that the recipient knows it is not a machine. */
  senderEmail: string;
  returnUrl: string;
  organizationName: string;
  clientName: string;
  contractNumber: number;
  /** ISO date. */
  contractDate: string;
  note: string | null;
};

export const subject = (organizationName: string) =>
  `Contract de prestări servicii – ${organizationName}`;

const printedDate = (isoDate: string) => isoDate.split('-').reverse().join('.');

// Written to someone who has no account and did not ask for an email from us: formal, in the
// provider's name. The contract is the attachment; the one thing to click brings the signed
// copy back.
export default function ServiceContract({
  senderName,
  senderEmail,
  returnUrl,
  organizationName,
  clientName,
  contractNumber,
  contractDate,
  note,
}: ServiceContractProps) {
  return (
    <Layout
      preview={`Contractul de prestări servicii nr. ${contractNumber}, de la ${organizationName}.`}
      reason={`Ați primit acest email pentru că ${organizationName} v-a trimis un contract prin SSM Ușor, aplicația în care își ține evidența clienților. Un răspuns la acest email ajunge la ${senderName ?? organizationName}, ${senderEmail}.`}
    >
      <Title>Contract de prestări servicii</Title>
      <Paragraph>Bună ziua,</Paragraph>
      {note && <Paragraph>{note}</Paragraph>}
      {/* One string: between text and a value React leaves a comment, which breaks up the
          sentence for anything that reads the HTML as text. */}
      <Paragraph>
        {`Vă transmitem atașat contractul de prestări servicii nr. ${contractNumber} din ${printedDate(contractDate)}, încheiat între ${organizationName} și ${clientName}.`}
      </Paragraph>
      <Paragraph>
        Vă rugăm să îl semnați, electronic, cu certificatul calificat al firmei, sau pe hârtie și
        scanat, și să ne trimiteți exemplarul semnat prin butonul de mai jos. Puteți și să
        răspundeți la acest email cu fișierul atașat: răspunsul ajunge la{' '}
        {senderName ?? organizationName}, {senderEmail}.
      </Paragraph>
      <Action href={returnUrl}>Trimiteți exemplarul semnat</Action>
      <FallbackLink href={returnUrl} />
      <Paragraph>Pentru orice întrebare ne puteți scrie la aceeași adresă.</Paragraph>
      <Paragraph>
        Cu stimă,
        <br />
        {senderName ?? organizationName}
        {senderName && (
          <>
            <br />
            {organizationName}
          </>
        )}
      </Paragraph>
    </Layout>
  );
}

ServiceContract.PreviewProps = {
  senderName: 'Olga Popescu',
  senderEmail: 'olga@exemplu.example',
  returnUrl: 'https://app.ssmusor.ro/contract?token=exemplu',
  organizationName: 'S.C. Exemplu SSM S.R.L.',
  clientName: 'S.C. Gelateria Florești S.R.L.',
  contractNumber: 52,
  contractDate: '2026-09-21',
  note: 'Așa cum am discutat la telefon, am trecut abonamentul lunar convenit.',
} satisfies ServiceContractProps;
