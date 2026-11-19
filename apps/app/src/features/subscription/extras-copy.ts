import {
  type BillingCreditsUsage,
  type BillingExtra,
  type BillingExtras,
  type BillingSmsUsage,
  extraCeilingEuros,
  extraCreditsWithin,
  type ExtraKind,
  extraUnitCents,
  extraUnitsWithin,
  formatCount,
} from '@ssm-usor/contracts';

import { formatEuro } from './billing-format';
import { creditsCount } from './credits-copy';
import { codesLabel, type MeterTone } from './sms-copy';
import { roDate } from './subscription-copy';

export const extraNames: Record<ExtraKind, { label: string; rate: string; short: string }> = {
  sms: {
    label: 'Coduri SMS extra',
    rate: '0,10 € / SMS extra, plus TVA',
    short: 'codurile SMS',
  },
  credits: {
    label: 'Credite AI extra',
    rate: '1,50 € / 100 de credite AI extra, plus TVA',
    short: 'creditele AI',
  },
};

export const unitsLabel = (kind: ExtraKind, count: number) =>
  kind === 'sms' ? codesLabel(count) : creditsCount(count);

export type CeilingCheck = { ok: true; euros: number } | { ok: false; error: string };

export function checkCeiling(text: string): CeilingCheck {
  const trimmed = text.trim().replace(/\s*€$/, '');
  if (trimmed === '') return { ok: false, error: 'Scrie plafonul lunar, în euro.' };
  if (!/^\d+$/.test(trimmed))
    return { ok: false, error: 'Scrie o sumă în euro întregi, fără bani.' };
  const euros = Number(trimmed);
  if (euros < extraCeilingEuros.min) {
    return {
      ok: false,
      error: 'Plafonul e de cel puțin 1 €. Ca să nu plătești nimic, lasă Extra oprit.',
    };
  }
  if (euros > extraCeilingEuros.max) {
    return { ok: false, error: `Plafonul e de cel mult ${extraCeilingEuros.max} € pe lună.` };
  }
  return { ok: true, euros };
}

export function ceilingBuys(kind: ExtraKind, euros: number) {
  const cents = euros * 100;
  if (kind === 'sms') {
    return `Până la ${codesLabel(extraUnitsWithin('sms', cents))} extra pe lună.`;
  }
  const credits = extraCreditsWithin(cents);
  if (credits === 0) return 'Cu 1 € nu ajungi la 100 de credite AI, care costă 1,50 €.';
  const spent = extraUnitsWithin('credits', cents) * extraUnitCents('credits');
  return `Până la ${creditsCount(credits)} extra pe lună, în pachete de 100: cel mult ${formatEuro(spent)}.`;
}

export type ExtraRowState = 'off' | 'suspended' | 'on' | 'reached';

export function extraRowState(
  extra: BillingExtra,
  unavailable: BillingExtras['unavailable'] = null
): ExtraRowState {
  if (!extra.enabled) return 'off';
  if (unavailable !== null) return 'suspended';
  if (extra.limit === null || extra.limit === 0 || extra.used === null) return 'on';
  return extra.used >= extra.limit ? 'reached' : 'on';
}

const blockPrice = formatEuro(extraUnitCents('credits'));

export function extraOnLine(kind: ExtraKind, extra: BillingExtra, renewsAt: string | null) {
  const ceiling = formatEuro(extra.ceilingCents ?? 0);
  const spent = formatEuro(extra.spentCents ?? 0);
  const used = extra.used ?? 0;
  const until = renewsAt ? `Până pe ${roDate(renewsAt)}` : 'Până la reînnoire';
  if (kind === 'credits' && extra.limit === 0) {
    return `Cu ${ceiling} nu ajungi la un pachet de 100 de credite AI, care costă ${blockPrice}. Mărește plafonul ca să le poți folosi.`;
  }
  if (extraRowState(extra) === 'reached') {
    return kind === 'sms'
      ? `Plafon atins: ${spent} din ${ceiling}. ${until}, codurile pleacă pe email.`
      : `${creditsCount(used)} cumpărate: ${spent} din ${ceiling}. Încă un pachet de ${blockPrice} nu mai încape în plafon.`;
  }
  if (used === 0) return `Plafon ${ceiling} pe lună. Nimic folosit luna aceasta.`;
  return kind === 'sms'
    ? `${codesLabel(used)} extra până azi: ${spent} din ${ceiling}.`
    : `${creditsCount(used)} extra cumpărate luna aceasta: ${spent} din ${ceiling}.`;
}

export const ceilingNote = 'Extra apare pe factura lunii doar cât îl folosești, plus TVA.';

export function unavailableNote(
  unavailable: BillingExtras['unavailable'],
  firstPaymentAt: string | null = null
): string | null {
  switch (unavailable) {
    case null:
      return null;
    case 'trial':
      return firstPaymentAt
        ? `Se poate porni după prima plată, pe ${roDate(firstPaymentAt)}.`
        : 'Se poate porni după ce alegi un plan.';
    case 'past_due':
      return 'Extra e oprit cât timp o plată e restantă și pornește din nou după plată. Plafonul îl poți micșora sau poți opri Extra și acum.';
    default:
      return null;
  }
}

export function savedMessage(kind: ExtraKind, euros: number | null) {
  return euros === null
    ? `Extra oprit pentru ${extraNames[kind].short}.`
    : `Extra pornit pentru ${extraNames[kind].short}: până la ${euros} € pe lună.`;
}

export function extrasLines(extras: BillingExtras) {
  return (['sms', 'credits'] as const).flatMap((kind) => {
    const extra = extras[kind];
    if (!extra.spentCents || !extra.used) return [];
    const what =
      kind === 'sms' ? `${codesLabel(extra.used)} SMS extra` : `${creditsCount(extra.used)} extra`;
    return [{ label: `${what}, până azi`, amountCents: extra.spentCents }];
  });
}

export interface ExtraMeter {
  used: number | null;
  limit: number | null;
  value: string | null;
  ticks?: number[];
  tone: MeterTone;
  hint: string;
  // Points the owner at the Extra card when what is included ran out with extras off.
  toExtra?: boolean;
}

const smsUntil = (sms: BillingSmsUsage) =>
  sms.periodEnd ? `Până pe ${roDate(sms.periodEnd)}` : 'Până la reînnoire';

// A member is told that extras are in use, never how many: the count and the ceiling would give
// the owner's amounts away.
export function smsExtraMeter(
  sms: BillingSmsUsage,
  extras: BillingExtras,
  owner: boolean
): ExtraMeter | null {
  if (sms.included === null || (sms.state !== 'extra' && sms.state !== 'stopped')) return null;
  const included = formatCount(sms.included);
  const extra = extras.sms;
  const atCeiling = sms.state === 'stopped' && sms.extrasOn;
  if (sms.state === 'stopped' && !atCeiling && sms.overage === 0) {
    if (!owner || extras.unavailable !== null || extra.enabled) return null;
    return {
      used: sms.used,
      limit: sms.included,
      value: `${formatCount(sms.used)} din ${included}`,
      tone: 'danger',
      hint: `Ai folosit cele ${included} ale lunii. ${smsUntil(sms)}, codurile pleacă pe email, iar cine nu are email nu poate semna. Le poți trimite mai departe prin SMS din Extra.`,
      toExtra: true,
    };
  }
  const atCeilingHint = `Ai atins plafonul pentru codurile extra. ${smsUntil(sms)}, codurile pleacă pe email, iar cine nu are email nu poate semna.`;
  if (!owner) {
    return {
      used: sms.included,
      limit: sms.included,
      value: `${included} din ${included}`,
      tone: atCeiling ? 'danger' : 'over',
      hint: atCeiling
        ? atCeilingHint
        : `S-au folosit cele ${included} incluse. Codurile pleacă mai departe prin SMS, ca extra.`,
    };
  }
  const room = extra.limit !== null ? Math.max(extra.limit, sms.overage) : sms.overage;
  const total = sms.included + room;
  const bar = {
    used: sms.included + sms.overage,
    limit: total,
    value: `${included} + ${formatCount(sms.overage)} extra`,
    ticks: room > 0 ? [sms.included / total] : [],
  };
  if (sms.state === 'stopped') return { ...bar, tone: 'danger', hint: atCeilingHint };
  return {
    ...bar,
    tone: 'over',
    hint:
      sms.overage === 0
        ? `Ai folosit cele ${included} incluse. Codurile pleacă mai departe prin SMS, ca extra.`
        : `${codesLabel(sms.overage)} extra până azi, ${formatEuro(extra.spentCents ?? 0)} + TVA. Plafonul e în Extra.`,
  };
}

const stillStarts =
  'Un import pe care creditele rămase nu-l acoperă așteaptă luna următoare; unul mai mic pornește.';

export function creditsExtraMeter(
  credits: BillingCreditsUsage,
  extras: BillingExtras,
  owner: boolean
): ExtraMeter | null {
  if (credits.included === null || credits.left === null) return null;
  const limit = Math.max(0, credits.included - credits.shortfall);
  const renews = roDate(credits.periodEnd);
  const extra = extras.credits;
  if (!owner) {
    if (!credits.extrasOn || credits.left > 0) return null;
    const atCeiling = credits.state === 'out' || credits.state === 'negative';
    return {
      used: limit,
      limit,
      value: `${formatCount(limit)} din ${formatCount(limit)}`,
      tone: atCeiling ? 'danger' : 'over',
      hint: atCeiling
        ? `S-au folosit și creditele AI extra pe care le permite plafonul. ${stillStarts}`
        : 'S-au folosit creditele AI ale lunii. Importurile folosesc acum credite AI extra.',
    };
  }
  if (credits.extra === 0) {
    if (credits.state !== 'out' || extras.unavailable !== null || extra.enabled) return null;
    return {
      used: credits.used,
      limit,
      value: `${formatCount(credits.used)} din ${formatCount(limit)}`,
      tone: 'danger',
      hint: `Nu poți porni un import nou până pe ${renews}, când primești alte ${creditsCount(credits.included)}. Până atunci poți porni Extra pentru creditele AI.`,
      toExtra: true,
    };
  }
  const room = extra.limit !== null ? Math.max(extra.limit, credits.extra) : credits.extra;
  const total = limit + room;
  const bar = {
    used: limit + credits.extra,
    limit: total,
    value: `${formatCount(limit)} + ${formatCount(credits.extra)} extra`,
    ticks: [limit / total],
  };
  const spent = `, ${formatEuro(extra.spentCents ?? 0)} + TVA`;
  if (credits.state === 'out' || credits.state === 'negative') {
    return {
      ...bar,
      tone: 'danger',
      hint: `Ai folosit creditele AI extra pe care le permite plafonul${spent}. ${stillStarts}`,
    };
  }
  return {
    ...bar,
    tone: 'over',
    hint: `${creditsCount(credits.extra)} extra cumpărate luna aceasta${spent}. Plafonul e în Extra.`,
  };
}
