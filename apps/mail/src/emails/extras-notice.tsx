import type { ExtrasNoticeEmail } from '@ssm-usor/contracts/mail';

import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';
import { codes, euro } from './sms-usage-notice';

export type ExtrasNoticeProps = Omit<ExtrasNoticeEmail, 'to'>;

const fullDate = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
});

export function credits(count: number) {
  if (count === 1) return 'un credit AI';
  const tail = count % 100;
  const grouped = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return tail === 0 || tail >= 20 ? `${grouped} de credite AI` : `${grouped} credite AI`;
}

const what = { sms: 'codurile SMS extra', credits: 'creditele AI extra' } as const;

export function subject({ kind, level, ceilingCents }: ExtrasNoticeProps) {
  return level === 'near'
    ? `Ai folosit 80 % din plafonul pentru ${what[kind]}`
    : `Ai atins plafonul de ${euro(ceilingCents)} pentru ${what[kind]}`;
}

export default function ExtrasNotice(props: ExtrasNoticeProps) {
  const { kind, level, organizationName, ceilingCents, spentCents, used, limit, periodEnd } = props;
  const renewal = fullDate.format(new Date(periodEnd));
  const ceiling = euro(ceilingCents);
  const usedWords = kind === 'sms' ? `${codes(used)} extra` : `${credits(used)} extra`;
  const limitWords = kind === 'sms' ? codes(limit) : credits(limit);
  const reason = `Primești acest email pentru că ești adminul organizației ${organizationName} în SSM Ușor și ai pornit Extra. Îl trimitem o singură dată pe lună, când se întâmplă.`;
  const after =
    kind === 'sms'
      ? `Până pe ${renewal}, codurile de semnare pleacă pe email; lucrătorii fără email nu pot semna până atunci.`
      : `Până pe ${renewal}, importurile noi pornesc doar dacă le ajung creditele rămase.`;

  return (
    <Layout preview={subject(props)} reason={reason}>
      <Title>
        {level === 'near'
          ? `Plafonul pentru ${what[kind]} se apropie de capăt`
          : `Ai atins plafonul pentru ${what[kind]}`}
      </Title>
      <Paragraph>
        {`Luna aceasta, ${organizationName} a folosit ${usedWords}, adică ${euro(spentCents)} + TVA din plafonul de ${ceiling} pe lună, care ajunge pentru ${limitWords}.`}
      </Paragraph>
      <Paragraph>
        {level === 'near'
          ? kind === 'sms'
            ? `La plafon, codurile de semnare pleacă pe email până pe ${renewal}, iar lucrătorii fără email nu pot semna până atunci.`
            : `La plafon, până pe ${renewal} importurile noi pornesc doar dacă le ajung creditele rămase.`
          : `Ne-am oprit aici, ca factura să nu treacă de plafon. ${after}`}
      </Paragraph>
      <Paragraph>
        {`Suma apare pe factura din ${renewal}. Plafonul îl mărești, îl micșorezi sau oprești Extra oricând, din Abonament.`}
      </Paragraph>
      <Action href={props.subscriptionUrl}>
        {level === 'near' ? 'Vezi consumul' : 'Mărește plafonul'}
      </Action>
      <FallbackLink href={props.subscriptionUrl} />
    </Layout>
  );
}

ExtrasNotice.PreviewProps = {
  kind: 'sms',
  level: 'near',
  organizationName: 'Prevenire Plus SRL',
  ceilingCents: 1000,
  spentCents: 800,
  used: 80,
  limit: 100,
  periodEnd: '2026-12-01T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
} satisfies ExtrasNoticeProps;
