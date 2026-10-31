import type { SmsUsageNoticeEmail } from '@ssm-usor/contracts';
import type { CSSProperties } from 'react';

import { color } from '../theme';
import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type SmsUsageNoticeProps = Omit<SmsUsageNoticeEmail, 'to'>;

const zone = 'Europe/Bucharest';
const fullDate = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: zone,
});
const yearOf = new Intl.DateTimeFormat('ro-RO', { year: 'numeric', timeZone: zone });
const dayMonth = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  timeZone: zone,
});

const printed = (iso: string) => fullDate.format(new Date(iso));

// The month as the Abonament tab shows it: 14.10 – 13.11.2026, the end being the day before the
// count starts again.
function monthRange(periodStart: string, periodEnd: string) {
  const start = new Date(periodStart);
  const last = new Date(new Date(periodEnd).getTime() - 86_400_000);
  const sameYear = yearOf.format(start) === yearOf.format(last);
  return `${sameYear ? dayMonth.format(start) : fullDate.format(start)} – ${fullDate.format(last)}`;
}

export function codes(count: number) {
  if (count === 1) return 'un cod';
  const tail = count % 100;
  return tail === 0 || tail >= 20 ? `${count} de coduri` : `${count} coduri`;
}

const timesWords: Record<number, string> = {
  2: 'două',
  3: 'trei',
  4: 'patru',
  5: 'cinci',
  6: 'șase',
  7: 'șapte',
  8: 'opt',
  9: 'nouă',
  10: 'zece',
};

// Said only where the cap is a whole multiple of the included codes: codes granted by hand raise
// both by the same number, which breaks the ratio.
function timesOver(cap: number, included: number) {
  if (cap % included !== 0) return null;
  const times = cap / included;
  const word = timesWords[times] ?? (times % 100 >= 20 ? `${times} de` : `${times}`);
  return `de ${word} ori`;
}

// Intl's ro-RO writes "EUR"; the app and the pricing page write "€".
export function euro(cents: number) {
  const amount = new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${amount} €`;
}

export function subject({ kind, billed, used, included, periodEnd }: SmsUsageNoticeProps) {
  if (kind === 'sms_80') return `Ai folosit ${used} din cele ${codes(included)} SMS ale lunii`;
  if (kind === 'sms_100' && billed) return `Ai folosit toate cele ${codes(included)} SMS incluse`;
  return `Codurile de semnare nu mai pleacă prin SMS până pe ${dayMonth.format(new Date(periodEnd))}`;
}

type Figure = { label: string; value: string };

function Figures({ rows, total }: { rows: Figure[]; total?: Figure }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={figures}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={figureLabel}>{row.label}</td>
            <td style={figureValue}>{row.value}</td>
          </tr>
        ))}
        {total && (
          <tr>
            <td style={{ ...figureLabel, ...totalCell }}>{total.label}</td>
            <td style={{ ...figureValue, ...totalCell }}>{total.value}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Nothing past the included codes can be billed before the first payment or in a tester's trial
// (ADR 029), so those emails never speak of a price.
export default function SmsUsageNotice(props: SmsUsageNoticeProps) {
  const {
    kind,
    organizationName,
    planName,
    billed,
    used,
    included,
    cap,
    overageCents,
    periodStart,
    periodEnd,
    subscriptionUrl,
  } = props;
  const month = monthRange(periodStart, periodEnd);
  const renewal = printed(periodEnd);
  const where = planName ? `incluse în ${planName}` : 'incluse în perioada de probă';
  const includedLabel = planName ? 'Incluse în plan' : 'Incluse';
  const price = euro(overageCents);
  const reason = `Primești acest email pentru că ești administratorul organizației ${organizationName} în SSM Ușor. Îl trimitem o singură dată pe lună, când se întâmplă.`;
  const noSmsUntilRenewal = `Până pe ${renewal}, angajații cu email primesc codul pe email. Cei fără email nu pot semna până atunci; în portal li se spune să vorbească cu specialistul lor.`;

  if (kind === 'sms_80') {
    return (
      <Layout
        preview={`${organizationName} a trimis ${used} din cele ${codes(included)} SMS ale lunii.`}
        reason={reason}
      >
        <Title>Codurile SMS ale lunii se apropie de capăt</Title>
        <Paragraph>
          {`${organizationName} a trimis ${used} din cele ${codes(included)} de semnare prin SMS ${where}, în luna ${month}.`}
        </Paragraph>
        <Figures
          rows={[
            { label: includedLabel, value: String(included) },
            { label: 'Trimise până azi', value: String(used) },
          ]}
          total={{
            label: `Rămase până pe ${renewal}`,
            value: String(Math.max(0, included - used)),
          }}
        />
        <Paragraph>
          {billed
            ? `Peste ${included}, codurile se trimit mai departe, iar fiecare costă ${price} + TVA, pe factura din ${renewal}. Angajații care au email primesc codul pe email, fără cost; cere-le adresa celor care n-au dat-o.`
            : `Peste ${included}, codurile nu mai pleacă prin SMS până pe ${renewal}: angajații cu email îl primesc pe email, iar cei fără email nu pot semna până atunci. Cere adresa de email celor care n-au dat-o.`}
        </Paragraph>
        <Action href={subscriptionUrl}>Vezi consumul</Action>
        <FallbackLink href={subscriptionUrl} />
      </Layout>
    );
  }

  if (kind === 'sms_100' && billed) {
    const times = cap ? timesOver(cap, included) : null;
    return (
      <Layout preview={`De acum, fiecare cod SMS costă ${price} + TVA.`} reason={reason}>
        <Title>{`De acum, fiecare cod SMS costă ${price}`}</Title>
        <Paragraph>
          {`${organizationName} a trimis toate cele ${codes(included)} de semnare prin SMS ${where}, în luna ${month}.`}
        </Paragraph>
        <Figures
          rows={[
            { label: includedLabel, value: String(included) },
            { label: 'Trimise până azi', value: String(used) },
          ]}
          total={{
            label: `Peste plan, pe factura din ${renewal}`,
            value: `${price} + TVA fiecare`,
          }}
        />
        <Paragraph>
          {cap
            ? `Codurile se trimit mai departe, ca angajații să poată semna. Mergem până la ${cap} pe lună${times ? `, ${times} cele incluse` : ''}; acolo ne oprim și te anunțăm, ca factura să nu crească fără să știi.`
            : 'Codurile se trimit mai departe, ca angajații să poată semna.'}
        </Paragraph>
        <Action href={subscriptionUrl}>Vezi consumul</Action>
        <FallbackLink href={subscriptionUrl} />
      </Layout>
    );
  }

  if (kind === 'sms_cap') {
    const over = Math.max(0, used - included);
    const times = cap ? timesOver(cap, included) : null;
    return (
      <Layout
        preview={`Codurile de semnare nu mai pleacă prin SMS până pe ${renewal}.`}
        reason={reason}
      >
        <Title>Ai atins limita de siguranță pentru SMS</Title>
        <Paragraph>
          {`${organizationName} a trimis ${codes(used)} de semnare prin SMS în luna ${month}, ${times ? `${times} cele ${included} incluse` : `peste cele ${included} incluse`}. Ne-am oprit aici, ca factura să nu crească fără să știi.`}
        </Paragraph>
        <Paragraph>{noSmsUntilRenewal}</Paragraph>
        <Figures
          rows={[
            { label: includedLabel, value: String(included) },
            { label: 'Trimise', value: String(used) },
          ]}
          total={{
            label: `Peste plan: ${over} × ${price}`,
            value: `${euro(over * overageCents)} + TVA`,
          }}
        />
        <Paragraph>
          {`Suma apare pe factura din ${renewal}. Dacă vrei ca SMS-urile să pornească din nou acum, ridică limita din Abonament.`}
        </Paragraph>
        <Action href={subscriptionUrl}>Ridică limita</Action>
        <FallbackLink href={subscriptionUrl} />
      </Layout>
    );
  }

  return (
    <Layout
      preview={`Codurile de semnare nu mai pleacă prin SMS până pe ${renewal}.`}
      reason={reason}
    >
      <Title>Ai folosit toate codurile SMS ale lunii</Title>
      <Paragraph>
        {`${organizationName} a trimis toate cele ${codes(included)} de semnare prin SMS ${where}, în luna ${month}.`}
      </Paragraph>
      <Paragraph>{noSmsUntilRenewal}</Paragraph>
      <Figures
        rows={[
          { label: includedLabel, value: String(included) },
          { label: 'Trimise', value: String(used) },
        ]}
      />
      <Paragraph>
        {`Pe ${renewal} codurile prin SMS pornesc din nou. Dacă ai nevoie de mai multe până atunci, răspunde la acest email.`}
      </Paragraph>
      <Action href={subscriptionUrl}>Vezi consumul</Action>
      <FallbackLink href={subscriptionUrl} />
    </Layout>
  );
}

SmsUsageNotice.PreviewProps = {
  kind: 'sms_80',
  organizationName: 'Prevenire Plus SRL',
  planName: 'Profesional',
  billed: true,
  used: 252,
  included: 300,
  cap: 900,
  overageCents: 10,
  periodStart: '2026-10-14T08:00:00.000Z',
  periodEnd: '2026-11-14T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organization/subscription',
} satisfies SmsUsageNoticeProps;

const figures: CSSProperties = {
  margin: '0 0 20px',
  borderCollapse: 'collapse',
  fontSize: '15px',
  lineHeight: '22px',
};

const figureLabel: CSSProperties = { padding: '6px 0', color: color.muted };

const figureValue: CSSProperties = {
  padding: '6px 0',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  color: color.forest,
};

const totalCell: CSSProperties = {
  borderTop: `1px solid ${color.border}`,
  color: color.forest,
  fontWeight: 600,
};
