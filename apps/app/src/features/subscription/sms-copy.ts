import { type BillingSmsUsage, smsOverage } from '@ssm-usor/contracts';

import { formatCount, formatEuro } from './billing-format';
import { contactEmail, roDate } from './subscription-copy';

export type MeterTone = 'normal' | 'warning' | 'over' | 'danger';

/**
 * Who reads the meter, and why the codes stop where they stop. `tester` and `firstPayment` stop
 * hard at what is included; `billed` sends past it, up to the safety cap (ADR 029).
 */
export interface SmsReader {
  owner: boolean;
  stop: 'billed' | 'tester' | 'firstPayment';
}

export interface SmsMeter {
  // Null where nothing is drawn: no SMS at all, or no limit.
  used: number | null;
  limit: number | null;
  value: string | null;
  tone: MeterTone;
  hint: string;
  raiseCap: boolean;
}

// Kept on one line with its euro sign, which the bar and the hints otherwise wrap alone.
export const smsPrice = formatEuro(smsOverage.price.unitAmount).replace(' ', '\u00a0');

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

export function stopOf(sms: BillingSmsUsage, planChosen: boolean): SmsReader['stop'] {
  if (sms.cap !== null) return 'billed';
  return planChosen ? 'firstPayment' : 'tester';
}

const toneOf: Record<BillingSmsUsage['state'], MeterTone> = {
  none: 'normal',
  ok: 'normal',
  near: 'warning',
  over: 'over',
  capped: 'danger',
  stopped: 'danger',
};

export function smsMeterFor(sms: BillingSmsUsage, reader: SmsReader): SmsMeter {
  if (sms.state === 'none') {
    return {
      used: null,
      limit: null,
      value: null,
      tone: 'normal',
      hint: trialSmsNote,
      raiseCap: false,
    };
  }
  if (sms.included === null) {
    return {
      used: null,
      limit: null,
      value: formatCount(sms.used),
      tone: 'normal',
      hint: 'Fără limită. Se numără doar codurile de semnare.',
      raiseCap: false,
    };
  }
  const { owner, stop } = reader;
  const included = formatCount(sms.included);
  const renews = sms.periodEnd ? roDate(sms.periodEnd) : null;
  const until = renews ? ` până pe ${renews}` : '';
  const cap = sms.cap === null ? null : codesLabel(sms.cap);
  const over = Math.max(0, sms.used - sms.included);
  const byEmail = 'codurile pleacă pe email, iar cine nu are email nu poate semna';

  let hint: string;
  switch (sms.state) {
    case 'ok':
      hint =
        stop === 'tester'
          ? `Cont de test: ${included} pe lună, fără costuri în plus. La ${included}, codurile pleacă pe email${until}.`
          : stop === 'firstPayment'
            ? owner
              ? `Până la prima plată, codurile se opresc la ${included}; după ea, cele în plus costă ${smsPrice} fiecare.`
              : `Până la prima plată, codurile se opresc la ${included}.`
            : owner
              ? `Se numără doar codurile de semnare; invitațiile și codurile de conectare nu. Peste ${included}, fiecare cod costă ${smsPrice} și apare pe factura din ${renews ?? 'luna următoare'}.`
              : 'Se numără doar codurile de semnare; invitațiile și codurile de conectare nu.';
      break;
    case 'near': {
      const left = formatCount(sms.included - sms.used);
      hint =
        stop !== 'billed'
          ? `Mai ai ${left}${until}. Apoi ${byEmail}.`
          : owner
            ? `Mai ai ${left} incluse${until}. Apoi fiecare cod costă ${smsPrice} și apare pe factură; codurile se trimit mai departe, până la ${cap} pe lună.`
            : `Mai ai ${left} incluse${until}. Apoi codurile se trimit mai departe, până la ${cap} pe lună.`;
      break;
    }
    case 'over':
      hint = owner
        ? `+${formatCount(over)} peste cele incluse, ${smsPrice} fiecare, pe factura din ${renews ?? 'luna următoare'}. Codurile se trimit mai departe, până la ${cap} pe lună.`
        : `+${formatCount(over)} peste cele incluse. Codurile se trimit mai departe, până la ${cap} pe lună.`;
      break;
    case 'capped': {
      const reached = `Ai atins limita de siguranță, de ${cap} pe lună.${renews ? ` Până pe ${renews},` : ''} ${byEmail}.`;
      hint = owner
        ? `${reached} Cele ${formatCount(over)} peste plan: ${formatEuro(over * smsOverage.price.unitAmount)} + TVA, pe factura din ${renews ?? 'luna următoare'}.`
        : `${reached} Administratorul poate ridica limita.`;
      break;
    }
    case 'stopped':
      hint =
        stop === 'tester'
          ? `Cont de test: ai folosit cele ${included} din luna aceasta.${renews ? ` Până pe ${renews},` : ''} ${byEmail}. Ai nevoie de mai multe? Scrie-ne la ${contactEmail}.`
          : `Ai folosit cele ${included} de până la prima plată.${renews ? ` Până pe ${renews},` : ''} ${byEmail}.${owner ? ` După prima plată, cele în plus costă ${smsPrice} fiecare.` : ''}`;
      break;
  }

  return {
    used: sms.used,
    limit: sms.included,
    value: `${formatCount(sms.used)} din ${included}`,
    tone: toneOf[sms.state],
    hint,
    raiseCap: owner && sms.state === 'capped',
  };
}

export interface SmsBar {
  kind: 'sms' | 'smsStop';
  state: 'near' | 'over' | 'capped' | 'stopped';
  lead: string;
  // The lead on a phone, where the bar keeps to one line.
  short: string;
  detail: string;
  closable: boolean;
  // At the cap the bar offers only what the owner can do about it.
  link: 'usage' | 'raiseCap' | null;
}

/** From 80 % of what is included (ADR 029); none below it, and none while no SMS goes. */
export function smsBarFor(sms: BillingSmsUsage, reader: SmsReader & { canAct: boolean }) {
  if (sms.included === null) return null;
  const { owner, stop } = reader;
  const included = codesLabel(sms.included);
  const renews = sms.periodEnd ? roDate(sms.periodEnd).slice(0, 5) : null;
  const on = renews ? ` pe ${renews}` : '';
  const until = renews ? `Până pe ${renews} pleacă pe email` : 'Pleacă pe email';
  const stopped = {
    lead: 'Codurile de semnare nu mai pleacă prin SMS.',
    short: 'Codurile SMS s-au oprit.',
  };
  switch (sms.state) {
    case 'near':
      return {
        kind: 'sms',
        state: 'near',
        lead: `Ai folosit ${formatCount(sms.used)} din cele ${included} de semnare prin SMS.`,
        short: `${formatCount(sms.used)} din ${included} SMS.`,
        detail:
          stop !== 'billed'
            ? `Se reînnoiesc${on}. Peste ${formatCount(sms.included)}, codurile pleacă pe email.`
            : owner
              ? `Se reînnoiesc${on}. Peste ${formatCount(sms.included)}, fiecare cod costă ${smsPrice}.`
              : `Se reînnoiesc${on}.`,
        closable: true,
        link: 'usage',
      } satisfies SmsBar;
    case 'over':
      return {
        kind: 'sms',
        state: 'over',
        lead: `Ai trecut de cele ${included} SMS incluse.`,
        short: `Peste cele ${included} SMS.`,
        detail: owner
          ? `Codurile pleacă mai departe, cu ${smsPrice} fiecare, pe factura din ${renews ?? 'luna următoare'}.`
          : `Codurile pleacă mai departe${renews ? ` până pe ${renews}, când se reînnoiesc` : ''}.`,
        closable: false,
        link: 'usage',
      } satisfies SmsBar;
    case 'capped': {
      const cap = formatCount(sms.cap ?? sms.included);
      return {
        kind: 'smsStop',
        state: 'capped',
        ...stopped,
        detail: owner
          ? `Ai atins limita de siguranță de ${cap} pe lună. ${until}; cine nu are email nu poate semna.`
          : `S-a atins limita de ${cap} pe lună. ${until}; administratorul poate ridica limita.`,
        closable: false,
        link: reader.canAct ? 'raiseCap' : owner ? 'usage' : null,
      } satisfies SmsBar;
    }
    case 'stopped':
      return {
        kind: 'smsStop',
        state: 'stopped',
        ...stopped,
        detail: `Ai folosit cele ${included} ${stop === 'tester' ? 'ale lunii' : 'de până la prima plată'}. ${until}; cine nu are email nu poate semna.`,
        closable: false,
        link: 'usage',
      } satisfies SmsBar;
    default:
      return null;
  }
}
