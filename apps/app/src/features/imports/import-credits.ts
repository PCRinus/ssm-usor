import {
  type BillingCreditsUsage,
  type CreditsShort,
  type ImportCredits,
  importCredits,
  type ImportKind,
  importStartCredits,
  type SubscriptionSummary,
} from '@ssm-usor/contracts';

import { formatCount } from '@/features/subscription/billing-format';

const takesDe = (value: number) => {
  const tail = Math.abs(value) % 100;
  return value !== 0 && (tail === 0 || tail >= 20);
};

export const creditsLabel = (value: number) =>
  value === 1 ? '1 credit AI' : `${formatCount(value)} ${takesDe(value) ? 'de ' : ''}credite AI`;

const scannedPagesLabel = (value: number) =>
  value === 1 ? '1 pagină scanată' : `${value} ${takesDe(value) ? 'de ' : ''}pagini scanate`;

const photosCount = (value: number) =>
  value === 1 ? 'o fotografie' : `${value} ${takesDe(value) ? 'de ' : ''}fotografii`;

const dayFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

export const creditsDay = (iso: string) => dayFormat.format(new Date(iso));

export interface CreditsBalance {
  // The month's credits and the gift's together; below zero after a reading that found more
  // scanned pages than were left.
  available: number;
  usage: BillingCreditsUsage;
  renewal: { at: string; monthly: number } | null;
  trial: boolean;
  // A paid subscription had its gift at the first payment; a trial and a tester's never did.
  hadGift: boolean;
  owner: boolean;
  // A member is told no extras counts: when extras are on, or the server says credits remain that
  // the member cannot see (a block already bought), the server decides whether an import starts.
  serverDecides: boolean;
  // A paid subscription in good standing, the only one that can have extras.
  paid: boolean;
}

type Account = {
  subscription?: SubscriptionSummary | null;
  creditsThisMonth?: BillingCreditsUsage | null;
};

/** Null when nothing limits the credits, or before the account answers. */
export function creditsBalance(
  account: Account | undefined,
  { owner = true }: { owner?: boolean } = {}
): CreditsBalance | null {
  const usage = account?.creditsThisMonth;
  if (!usage || usage.left === null || usage.state === 'unlimited') return null;
  const subscription = account.subscription ?? null;
  return {
    // While a ceiling applies, a shortfall waits for next month and the month counts from zero.
    available:
      (usage.extrasOn ? Math.max(usage.left, 0) : usage.left) + usage.giftLeft + usage.extraLeft,
    usage,
    renewal: renewalOf(usage, subscription),
    trial: usage.period === 'trial',
    hadGift: subscription?.status !== 'trialing',
    owner,
    serverDecides:
      !owner &&
      usage.state !== 'out' &&
      usage.state !== 'negative' &&
      (usage.extrasOn || usage.left + usage.giftLeft <= 0),
    paid: Boolean(subscription?.planChosen) && subscription?.status === 'active',
  };
}

function renewalOf(
  usage: BillingCreditsUsage,
  subscription: SubscriptionSummary | null
): CreditsBalance['renewal'] {
  if (!subscription) return null;
  if (usage.period === 'month') {
    // A paid subscription with an end in sight is cancelled: its month does not come again.
    if (subscription.status !== 'trialing' && subscription.accessUntil) return null;
    return { at: usage.periodEnd, monthly: usage.allowance ?? 0 };
  }
  return null;
}

export type CreditsRefusal =
  { kind: 'none' } | { kind: 'short'; needed: number; available: number; renewsAt: string | null };

export function creditsRefusal(
  balance: CreditsBalance | null,
  needed: number
): CreditsRefusal | null {
  if (!balance || balance.serverDecides) return null;
  if (balance.available <= 0) return { kind: 'none' };
  if (needed <= balance.available) return null;
  return {
    kind: 'short',
    needed,
    available: balance.available,
    renewsAt: balance.renewal?.at ?? null,
  };
}

export const refusalFromApi = (short: CreditsShort): CreditsRefusal =>
  short.left <= 0
    ? { kind: 'none' }
    : { kind: 'short', needed: short.needed, available: short.left, renewsAt: short.renewsAt };

export function usesSentence(
  kind: ImportKind,
  files: { photos: number; pdfPages: number; pdfs: number }
) {
  const needed = importStartCredits(kind, files);
  if (kind === 'employees') {
    const per = files.pdfs > 0 ? 'unul pe fotografie sau pagină' : 'unul pe fotografie';
    return needed === 0
      ? `Folosește un credit AI pe fotografie${files.pdfs > 0 ? ' sau pagină' : ''}.`
      : needed === 1
        ? 'Folosește 1 credit AI.'
        : `Folosește ${creditsLabel(needed)}, ${per}.`;
  }
  const known =
    files.photos === 0
      ? creditsLabel(needed)
      : `${creditsLabel(needed)} (${importCredits.clientReading} + ${photosCount(files.photos)})`;
  const { ssm, su } = importCredits.ownInstructions;
  return `Folosește ${known}, plus 1 pentru fiecare pagină scanată. Dacă le găsim, instrucțiunile proprii folosesc încă ${ssm} (IPSSM) și ${su} (IPSU), iar evaluările de risc încă ${importCredits.riskEvaluations}.`;
}

export function leftSentence(balance: CreditsBalance, short: boolean) {
  const { available, usage, renewal } = balance;
  const left = formatCount(available);
  const remain = available === 1 ? 'Îți mai rămâne' : 'Îți mai rămân';
  if (short) {
    return renewal
      ? `${remain} ${left} până pe ${creditsDay(renewal.at)}.`
      : `${remain} ${left} din cele ${formatCount(usage.included ?? 0)} ale perioadei de probă.`;
  }
  if (balance.trial) {
    return `${remain} ${left} din cele ${formatCount(usage.included ?? 0)} ale perioadei de probă.`;
  }
  const month = `${remain} ${formatCount(usage.left ?? 0)} din ${formatCount(usage.included ?? 0)} luna aceasta`;
  const gift =
    usage.giftLeft > 0 ? ` și ${formatCount(usage.giftLeft)} din cadoul de bun venit` : '';
  const extra =
    usage.extraLeft > 0
      ? `, plus până la ${formatCount(usage.extraLeft)} extra, în pachete de 100`
      : '';
  const uncounted =
    balance.serverDecides && usage.extrasOn
      ? ' Extra e pornit pentru creditele AI, așa că importul poate folosi și credite AI extra.'
      : '';
  return `${month}${gift}${extra}.${uncounted}`;
}

function renewalSentence(balance: CreditsBalance, kind: ImportKind) {
  const { renewal } = balance;
  if (!renewal) {
    return balance.trial
      ? 'Creditele AI ale perioadei de probă nu se reînnoiesc. La prima plată primești creditele lunii și pe cele de bun venit.'
      : null;
  }
  const day = creditsDay(renewal.at);
  return kind === 'client'
    ? `Pe ${day} primești alte ${formatCount(renewal.monthly)} și poți porni importul.`
    : `Pe ${day} primești alte ${formatCount(renewal.monthly)}.`;
}

export function shortText(
  kind: ImportKind,
  refusal: Extract<CreditsRefusal, { kind: 'short' }>,
  balance: CreditsBalance | null,
  withPages = false
) {
  const left = formatCount(refusal.available);
  const remain = refusal.available === 1 ? 'îți mai rămâne' : 'îți mai rămân';
  const until = refusal.renewsAt ? ` până pe ${creditsDay(refusal.renewsAt)}` : '';
  if (kind === 'employees') {
    return {
      title: 'Nu ajung creditele AI pentru toate fotografiile',
      text: `Cele ${withPages ? photosAndPages(refusal.needed) : photosCount(refusal.needed)} folosesc ${creditsLabel(refusal.needed)}, iar ție ${remain} ${left}${until}. Scoate o parte și păstreaz-o pentru ${refusal.renewsAt ? 'un import după reînnoire' : 'un import următor'}, cu toate fotografiile unei persoane în același import.`,
    };
  }
  const uses =
    refusal.needed === importCredits.clientReading
      ? `Citirea documentelor unui client folosește ${creditsLabel(refusal.needed)}`
      : `Importul folosește ${creditsLabel(refusal.needed)} înainte de paginile scanate`;
  const renewal = balance ? renewalSentence(balance, kind) : null;
  return {
    title: 'Nu ajung creditele AI pentru acest import',
    text: `${uses}, iar ție ${remain} ${left}.${renewal ? ` ${renewal}` : ''}`,
  };
}

const photosAndPages = (value: number) =>
  `${value} ${takesDe(value) ? 'de ' : ''}fotografii și pagini`;

export function noneText(kind: ImportKind, balance: CreditsBalance | null) {
  const used = !balance
    ? 'Ai folosit creditele AI.'
    : balance.trial
      ? `Ai folosit cele ${creditsLabel(balance.usage.included ?? 0)} ale perioadei de probă.`
      : `Ai folosit cele ${creditsLabel(balance.usage.included ?? 0)} ale lunii${balance.hadGift ? ' și pe cele de bun venit' : ''}.`;
  const renewal = balance ? renewalSentence(balance, kind) : null;
  const what = kind === 'client' ? 'din documente' : 'din fișe';
  return {
    title: 'Nu mai ai credite AI',
    text: `${used}${renewal ? ` ${renewal}` : ''} Până atunci nu poți porni un import nou ${what}.${balance ? extrasHint(balance) : ''}`,
  };
}

function extrasHint(balance: CreditsBalance) {
  if (!balance.paid) return '';
  if (balance.usage.extrasOn) {
    return balance.owner
      ? ' Ai folosit și creditele AI extra pe care le permite plafonul; îl poți mări din Abonament, la Extra.'
      : ' S-au folosit și creditele AI extra pe care le permite plafonul ales de admin.';
  }
  return balance.owner
    ? ' Poți porni Extra pentru creditele AI din Abonament.'
    : ' Adminul poate porni Extra pentru creditele AI.';
}

export function refusalSentence(short: CreditsShort) {
  const until = short.renewsAt ? ` până pe ${creditsDay(short.renewsAt)}` : '';
  return short.left <= 0
    ? `Nu mai ai credite AI${until}. Importurile noi așteaptă luna următoare.`
    : `Nu ajung creditele AI: importul folosește ${creditsLabel(short.needed)}, iar ție ${short.left === 1 ? 'îți mai rămâne' : 'îți mai rămân'} ${formatCount(short.left)}${until}.`;
}

export function usedSentence(credits: ImportCredits, kind: ImportKind) {
  const total = `Importul a folosit ${creditsLabel(credits.used)}`;
  const parts = [
    ...(credits.scannedPages > 0 ? [scannedPagesLabel(credits.scannedPages)] : []),
    ...(credits.ownInstructions > 0
      ? [`${credits.ownInstructions} pentru instrucțiunile proprii`]
      : []),
    ...(credits.riskEvaluations > 0
      ? [`${credits.riskEvaluations} pentru evaluările de risc`]
      : []),
  ];
  if (kind === 'employees' || parts.length === 0 || credits.refunded) return `${total}.`;
  return `${total} (${[credits.atStart, ...parts].join(' + ')}).`;
}

export const overSentence = (over: number) =>
  `Ai trecut cu ${formatCount(over)} peste cele rămase; le scădem din creditele AI ale lunii viitoare.`;

export const refundedSentence = 'Creditele AI ți-au fost returnate.';
