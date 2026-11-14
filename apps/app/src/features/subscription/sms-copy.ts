import type { BillingSmsUsage, SubscriptionSummary } from '@ssm-usor/contracts';

import { formatCount } from './billing-format';
import { contactEmail, roDate } from './subscription-copy';

export type MeterTone = 'normal' | 'warning' | 'over' | 'danger';

/**
 * Who reads the meter, and why the codes stop where they stop. Every stop is hard: past what is
 * included the codes go by email until the month renews, and nothing is billed, since extras are
 * off until the owner can turn them on (ADR 029, amendment of 2026-11-14). `month` is a paid
 * plan's, `firstPayment` a plan chosen during the trial, `tester` a tester's trial.
 */
export interface SmsReader {
  owner: boolean;
  stop: 'month' | 'tester' | 'firstPayment';
}

export interface SmsMeter {
  // Null where nothing is drawn: no SMS at all, or no limit.
  used: number | null;
  limit: number | null;
  value: string | null;
  tone: MeterTone;
  hint: string;
}

export const trialSmsNote =
  'În perioada de probă nu trimitem SMS: invitațiile, codurile de conectare și cele de semnare pleacă pe email. SMS-urile pornesc când alegi un plan.';

/** "1 cod", "12 coduri", "300 de coduri", "1.200 de coduri". */
export function codesLabel(count: number) {
  if (count === 1) return '1 cod';
  const tail = count % 100;
  return count !== 0 && (tail === 0 || tail >= 20)
    ? `${formatCount(count)} de coduri`
    : `${formatCount(count)} coduri`;
}

export function stopOf(
  subscription: Pick<SubscriptionSummary, 'planChosen' | 'status'> | null
): SmsReader['stop'] {
  if (!subscription?.planChosen) return 'tester';
  return subscription.status === 'trialing' ? 'firstPayment' : 'month';
}

const toneOf: Record<BillingSmsUsage['state'], MeterTone> = {
  none: 'normal',
  ok: 'normal',
  near: 'warning',
  stopped: 'danger',
};

const byEmail = 'codurile pleacă pe email, iar cine nu are email nu poate semna';

export function smsMeterFor(sms: BillingSmsUsage, reader: SmsReader): SmsMeter {
  if (sms.state === 'none') {
    return { used: null, limit: null, value: null, tone: 'normal', hint: trialSmsNote };
  }
  if (sms.included === null) {
    return {
      used: null,
      limit: null,
      value: formatCount(sms.used),
      tone: 'normal',
      hint: 'Fără limită. Se numără doar codurile de semnare.',
    };
  }
  const { stop } = reader;
  const included = formatCount(sms.included);
  const renews = sms.periodEnd ? roDate(sms.periodEnd) : null;
  const until = renews ? ` până pe ${renews}` : '';

  let hint: string;
  switch (sms.state) {
    case 'ok':
      hint =
        stop === 'tester'
          ? `Cont de test: ${included} pe lună, fără costuri în plus. La ${included}, codurile pleacă pe email${until}.`
          : stop === 'firstPayment'
            ? `Până la prima plată, codurile se opresc la ${included}.`
            : `Se numără doar codurile de semnare; invitațiile și codurile de conectare nu. Peste ${included}, ${byEmail}${until}.`;
      break;
    case 'near':
      hint = `Mai ai ${formatCount(sms.included - sms.used)}${until}. Apoi ${byEmail}.`;
      break;
    default:
      hint =
        stop === 'tester'
          ? `Cont de test: ai folosit cele ${included} din luna aceasta.${renews ? ` Până pe ${renews},` : ''} ${byEmail}. Ai nevoie de mai multe? Scrie-ne la ${contactEmail}.`
          : stop === 'firstPayment'
            ? `Ai folosit cele ${included} de până la prima plată.${renews ? ` Până pe ${renews},` : ''} ${byEmail}.`
            : `Ai folosit cele ${included} ale lunii.${renews ? ` Până pe ${renews},` : ''} ${byEmail}.`;
  }

  return {
    used: sms.used,
    limit: sms.included,
    value: `${formatCount(sms.used)} din ${included}`,
    tone: toneOf[sms.state],
    hint,
  };
}

export interface SmsBar {
  kind: 'sms' | 'smsStop';
  state: 'near' | 'stopped';
  lead: string;
  // The lead on a phone, where the bar keeps to one line.
  short: string;
  detail: string;
  closable: boolean;
}

const stopWords: Record<SmsReader['stop'], string> = {
  month: 'ale lunii',
  tester: 'ale lunii',
  firstPayment: 'de până la prima plată',
};

/** From 80 % of what is included (ADR 029); none below it, and none while no SMS goes. */
export function smsBarFor(sms: BillingSmsUsage, reader: SmsReader): SmsBar | null {
  if (sms.included === null) return null;
  const included = codesLabel(sms.included);
  const renews = sms.periodEnd ? roDate(sms.periodEnd).slice(0, 5) : null;
  const on = renews ? ` pe ${renews}` : '';
  const until = renews ? `Până pe ${renews} pleacă pe email` : 'Pleacă pe email';
  switch (sms.state) {
    case 'near':
      return {
        kind: 'sms',
        state: 'near',
        lead: `Ai folosit ${formatCount(sms.used)} din cele ${included} de semnare prin SMS.`,
        short: `${formatCount(sms.used)} din ${included} SMS.`,
        detail: `Se reînnoiesc${on}. Peste ${formatCount(sms.included)}, codurile pleacă pe email.`,
        closable: true,
      };
    case 'stopped':
      return {
        kind: 'smsStop',
        state: 'stopped',
        lead: 'Codurile de semnare nu mai pleacă prin SMS.',
        short: 'Codurile SMS s-au oprit.',
        detail: `Ai folosit cele ${included} ${stopWords[reader.stop]}. ${until}; cine nu are email nu poate semna.`,
        closable: false,
      };
    default:
      return null;
  }
}
