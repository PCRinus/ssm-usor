import type { BillingCreditsUsage } from '@ssm-usor/contracts';

import { formatCount } from './billing-format';
import type { MeterTone } from './sms-copy';
import { contactEmail, roDate } from './subscription-copy';

export const creditsLabel = 'Credite pentru import';

export const creditsExplained =
  'Un credit e o pagină scanată sau o fotografie citită la import. Documentele unui client costă 25 de credite, plus câte unul pentru fiecare pagină scanată.';

/** "1 credit", "12 credite", "300 de credite", "10.000 de credite". */
export function creditsCount(count: number) {
  if (count === 1) return '1 credit';
  const tail = count % 100;
  return count !== 0 && (tail === 0 || tail >= 20)
    ? `${formatCount(count)} de credite`
    : `${formatCount(count)} credite`;
}

/**
 * Whose credits these are: a trial's last the whole trial; a tester's renew each month with a hard
 * stop; a paying organization's renew each month and are topped up by the welcome gift.
 */
export type CreditsReader =
  { kind: 'trial'; nextMonthly: number | null } | { kind: 'tester' } | { kind: 'paid' };

export function creditsReaderOf(
  credits: BillingCreditsUsage,
  { planChosen, nextMonthly }: { planChosen: boolean; nextMonthly: number | null }
): CreditsReader {
  if (credits.period === 'trial') return { kind: 'trial', nextMonthly };
  return planChosen ? { kind: 'paid' } : { kind: 'tester' };
}

export interface CreditsMeter {
  used: number | null;
  limit: number | null;
  value: string;
  // The value on a phone, where the long one does not fit beside the label.
  valueShort: string | null;
  tone: MeterTone;
  hint: string;
  // The hint on a phone, which then carries what the short value leaves out.
  hintShort: string | null;
}

const tones: Record<BillingCreditsUsage['state'], MeterTone> = {
  ok: 'normal',
  near: 'warning',
  out: 'danger',
  negative: 'over',
  unlimited: 'normal',
};

export function creditsMeterFor(credits: BillingCreditsUsage, reader: CreditsReader): CreditsMeter {
  if (credits.included === null || credits.left === null) {
    return {
      used: null,
      limit: null,
      value: formatCount(credits.used),
      valueShort: null,
      tone: 'normal',
      hint: 'Fără limită.',
      hintShort: null,
    };
  }
  const limit = Math.max(0, credits.included - credits.shortfall);
  const renews = roDate(credits.periodEnd);
  const available = credits.left + credits.giftLeft;
  const askUs = `scrie-ne la ${contactEmail} și îți adăugăm credite`;
  const shortfall =
    credits.shortfall > 0
      ? ` Luna aceasta ai ${formatCount(limit)}: ${formatCount(credits.shortfall)} s-au scăzut pentru luna trecută.`
      : '';
  let hint: string;
  let hintShort: string | null = null;
  let value = `${formatCount(credits.used)} din ${formatCount(limit)}`;
  let valueShort: string | null = null;

  switch (credits.state) {
    case 'negative': {
      const below = formatCount(-credits.left);
      const next = reader.kind === 'trial' ? 'din prima lună plătită' : 'din luna viitoare';
      value = `−${below} · se scad ${next}`;
      valueShort = `−${below}`;
      const first =
        'Un import a găsit mai multe pagini scanate decât credite și a mers până la capăt.';
      const rest =
        reader.kind === 'trial'
          ? `Până la prima plată nu poți porni un import nou; dacă ai nevoie, ${askUs}.`
          : `Pe ${renews} primești ${formatCount(credits.included + credits.left)} în loc de ${formatCount(credits.included)}. Până atunci nu poți porni un import nou; dacă ai nevoie, ${askUs}.`;
      hint = `${first} ${rest}`;
      hintShort = `${first} Cele ${below} se scad ${next}. ${rest}`;
      break;
    }
    case 'out':
      hint =
        reader.kind === 'trial'
          ? `Ai folosit toate cele ${formatCount(credits.included)} ale perioadei de probă. Altele vin cu prima plată, după ce alegi un plan. Ai nevoie mai devreme? ${capitalized(askUs)}.`
          : reader.kind === 'tester'
            ? `Cont de test: ai folosit cele ${formatCount(credits.included)} ale lunii. Nu poți porni un import nou până pe ${renews}; dacă ai nevoie, ${askUs}.`
            : `Nu poți porni un import nou până pe ${renews}, când primești alte ${formatCount(credits.included)}. Ai nevoie mai devreme? ${capitalized(askUs)}.`;
      break;
    default: {
      const near =
        credits.state === 'near'
          ? reader.kind === 'paid'
            ? `Mai ai ${formatCount(available)}, cât pentru vreo ${formatCount(Math.floor(available / 25))} clienți. `
            : `Mai ai ${formatCount(available)}. `
          : '';
      if (reader.kind === 'trial') {
        hint =
          near +
          (reader.nextMonthly !== null && credits.giftPending > 0
            ? `Cele ${formatCount(credits.included)} din perioada de probă, până la prima plată. De pe ${renews} primești ${formatCount(reader.nextMonthly)} pe lună.`
            : `Pentru toată perioada de probă, până pe ${renews}. Nu se reînnoiesc.`);
      } else if (reader.kind === 'tester') {
        hint = `${near}Cont de test: ${formatCount(credits.included)} pe lună. La ${formatCount(credits.included)}, importurile se opresc până pe ${renews}; scrie-ne dacă ai nevoie de mai multe.`;
      } else if (credits.left <= 0 && credits.giftLeft > 0) {
        hint = `Creditele lunii s-au terminat, așa că importurile folosesc acum creditele de bun venit. Pe ${renews} primești alte ${formatCount(credits.included)}.`;
      } else {
        hint = near
          ? `${near}Pe ${renews} primești alte ${formatCount(credits.included)}.`
          : `Se reînnoiesc pe ${renews}; cele nefolosite nu se adună.`;
      }
    }
  }

  return {
    used: credits.used,
    limit,
    value,
    valueShort,
    tone: tones[credits.state],
    hint: hint + shortfall,
    hintShort: hintShort && hintShort + shortfall,
  };
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface GiftPanel {
  look: 'balance' | 'promise' | 'spent';
  title: string;
  text: string;
  value: string | null;
}

export function giftPanelFor(
  credits: BillingCreditsUsage,
  { paid, welcomeCredits }: { paid: boolean; welcomeCredits: number | null }
): GiftPanel | null {
  if (credits.giftPending > 0) {
    return {
      look: 'promise',
      title: `La prima plată primești ${creditsCount(credits.giftPending)} de bun venit.`,
      text: `Le primești pe ${roDate(credits.periodEnd)}, odată cu prima plată, ca să-ți muți clienții. Nu expiră.`,
      value: null,
    };
  }
  if (credits.giftLeft > 0) {
    return {
      look: 'balance',
      title: 'Credite de bun venit',
      text: `${welcomeCredits ? `Rămase din ${formatCount(welcomeCredits)}. ` : ''}Nu expiră și se folosesc după creditele lunii.`,
      value: formatCount(credits.giftLeft),
    };
  }
  if (paid && welcomeCredits) {
    return {
      look: 'spent',
      title: 'Credite de bun venit',
      text: `Le-ai folosit pe toate cele ${formatCount(welcomeCredits)}. Nu se mai primesc.`,
      value: '0',
    };
  }
  return null;
}
