import type { SmsUsageNoticeEmail } from '@ssm-usor/contracts/mail';
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

// Nothing past the included codes is billed unless the owner turned SMS extras on (ADR 029), so
// the other emails never speak of a price.
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
  const reason = `Primești acest email pentru că ești adminul organizației ${organizationName} în SSM Ușor. Îl trimitem o singură dată pe lună, când se întâmplă.`;
  const noSmsUntilRenewal = `Până pe ${renewal}, lucrătorii cu email primesc codul pe email. Cei fără email nu pot semna până atunci; în portal li se spune să vorbească cu specialistul lor.`;

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
            ? `Ai pornit Extra pentru codurile SMS: peste ${included}, codurile se trimit mai departe, iar fiecare costă ${price} + TVA, pe factura din ${renewal}, până la plafonul ales. Lucrătorii care au email primesc codul pe email, fără cost; cere-le adresa celor care n-au dat-o.`
            : `Peste ${included}, codurile nu mai pleacă prin SMS până pe ${renewal}: lucrătorii cu email îl primesc pe email, iar cei fără email nu pot semna până atunci. Cere adresa de email celor care n-au dat-o.`}
        </Paragraph>
        <Action href={subscriptionUrl}>Vezi consumul</Action>
        <FallbackLink href={subscriptionUrl} />
      </Layout>
    );
  }

  if (kind === 'sms_100' && billed) {
    const more = cap ? Math.max(0, cap - included) : 0;
    return (
      <Layout
        preview={`Codurile SMS pleacă mai departe, ca extra, cu ${price} + TVA fiecare.`}
        reason={reason}
      >
        <Title>Codurile SMS pleacă mai departe, ca extra</Title>
        <Paragraph>
          {`${organizationName} a trimis toate cele ${codes(included)} de semnare prin SMS ${where}, în luna ${month}.`}
        </Paragraph>
        <Figures
          rows={[
            { label: includedLabel, value: String(included) },
            { label: 'Trimise până azi', value: String(used) },
          ]}
          total={{
            label: `Extra, pe factura din ${renewal}`,
            value: `${price} + TVA fiecare`,
          }}
        />
        <Paragraph>
          {`Pentru că ai pornit Extra, codurile se trimit mai departe, ca lucrătorii să poată semna: încă ${codes(more)} luna aceasta, cât încap în plafonul ales. Plafonul îl schimbi sau oprești Extra oricând, din Abonament.`}
        </Paragraph>
        <Action href={subscriptionUrl}>Vezi consumul</Action>
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
        {`Pe ${renewal} codurile prin SMS pornesc din nou. Nu plătești nimic pentru codurile care pleacă pe email.${planName ? ' Dacă vrei ca ele să plece mai departe prin SMS, pornește Extra din Abonament, cu un plafon lunar ales de tine.' : ''}`}
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
  cap: 400,
  overageCents: 10,
  periodStart: '2026-10-14T08:00:00.000Z',
  periodEnd: '2026-11-14T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
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
