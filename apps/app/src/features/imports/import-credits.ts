import {
  type BillingCreditsUsage,
  billingPlans,
  type CreditsShort,
  type ImportCredits,
  importCredits,
  type ImportKind,
  type SubscriptionSummary,
} from '@ssm-usor/contracts';

import { formatCount } from '@/features/subscription/billing-format';

const takesDe = (value: number) => {
  const tail = Math.abs(value) % 100;
  return value !== 0 && (tail === 0 || tail >= 20);
};

export const creditsLabel = (value: number) =>
  value === 1 ? '1 credit' : `${formatCount(value)} ${takesDe(value) ? 'de ' : ''}credite`;

const scannedPagesLabel = (value: number) =>
  value === 1 ? '1 pagină scanată' : `${value} ${takesDe(value) ? 'de ' : ''}pagini scanate`;

const photosCount = (value: number) =>
  value === 1 ? 'o fotografie' : `${value} ${takesDe(value) ? 'de ' : ''}fotografii`;

const dayFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

export const creditsDay = (iso: string) => dayFormat.format(new Date(iso));

export function startCreditsOf(kind: ImportKind, files: { photos: number; pages: number }) {
  return kind === 'client'
    ? importCredits.clientReading + files.photos * importCredits.perPage
    : files.pages * importCredits.perPage;
}

export interface CreditsBalance {
  // The month's credits and the gift's together; below zero after a reading that found more
  // scanned pages than were left.
  available: number;
  usage: BillingCreditsUsage;
  renewal: { at: string; monthly: number; gift: number } | null;
  trial: boolean;
  // A paid subscription had its gift at the first payment; a trial and a tester's never did.
  hadGift: boolean;
}

type Account = {
  subscription?: SubscriptionSummary | null;
  creditsThisMonth?: BillingCreditsUsage | null;
};

/** Null when nothing limits the credits, or before the account answers. */
export function creditsBalance(account: Account | undefined): CreditsBalance | null {
  const usage = account?.creditsThisMonth;
  if (!usage || usage.left === null || usage.state === 'unlimited') return null;
  const subscription = account.subscription ?? null;
  return {
    available: usage.left + usage.giftLeft,
    usage,
    renewal: renewalOf(usage, subscription),
    trial: usage.period === 'trial',
    hadGift: subscription?.status !== 'trialing',
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
    return { at: usage.periodEnd, monthly: usage.allowance ?? 0, gift: 0 };
  }
  if (!subscription.planChosen || subscription.plan === 'enterprise') return null;
  return {
    at: usage.periodEnd,
    monthly: billingPlans[subscription.plan].monthlyCredits,
    gift: usage.giftPending,
  };
}

export type CreditsRefusal =
  { kind: 'none' } | { kind: 'short'; needed: number; available: number; renewsAt: string | null };

export function creditsRefusal(
  balance: CreditsBalance | null,
  needed: number
): CreditsRefusal | null {
  if (!balance) return null;
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
  files: { photos: number; pages: number; pdfs: number }
) {
  if (kind === 'employees') {
    const per = files.pdfs > 0 ? 'unul pe fotografie sau pagină' : 'unul pe fotografie';
    return files.pages === 0
      ? `Folosește un credit pe fotografie${files.pdfs > 0 ? ' sau pagină' : ''}.`
      : files.pages === 1
        ? 'Folosește 1 credit.'
        : `Folosește ${creditsLabel(files.pages)}, ${per}.`;
  }
  const needed = startCreditsOf('client', files);
  const known =
    files.photos === 0
      ? creditsLabel(needed)
      : `${creditsLabel(needed)} (${importCredits.clientReading} + ${photosCount(files.photos)})`;
  return `Folosește ${known}, plus 1 pentru fiecare pagină scanată.`;
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
  return usage.giftLeft > 0
    ? `${month} și ${formatCount(usage.giftLeft)} din cadoul de bun venit.`
    : `${month}.`;
}

function renewalSentence(balance: CreditsBalance, kind: ImportKind) {
  const { renewal } = balance;
  if (!renewal) {
    return balance.trial
      ? 'Creditele perioadei de probă nu se reînnoiesc. La prima plată primești creditele lunii și pe cele de bun venit.'
      : null;
  }
  const day = creditsDay(renewal.at);
  if (balance.trial) {
    const gift = renewal.gift > 0 ? ` și ${creditsLabel(renewal.gift)} de bun venit` : '';
    return `Pe ${day}, la prima plată, primești ${creditsLabel(renewal.monthly)} pe lună${gift}.`;
  }
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
      title: 'Nu ajung creditele pentru toate fotografiile',
      text: `Cele ${withPages ? photosAndPages(refusal.needed) : photosCount(refusal.needed)} folosesc ${creditsLabel(refusal.needed)}, iar ție ${remain} ${left}${until}. Scoate o parte și păstreaz-o pentru ${refusal.renewsAt ? 'un import după reînnoire' : 'un import următor'}, cu toate fotografiile unei persoane în același import.`,
    };
  }
  const uses =
    refusal.needed === importCredits.clientReading
      ? `Citirea documentelor unui client folosește ${creditsLabel(refusal.needed)}`
      : `Importul folosește ${creditsLabel(refusal.needed)} înainte de paginile scanate`;
  const renewal = balance ? renewalSentence(balance, kind) : null;
  return {
    title: 'Nu ajung creditele pentru acest import',
    text: `${uses}, iar ție ${remain} ${left}.${renewal ? ` ${renewal}` : ''}`,
  };
}

const photosAndPages = (value: number) =>
  `${value} ${takesDe(value) ? 'de ' : ''}fotografii și pagini`;

export function noneText(kind: ImportKind, balance: CreditsBalance | null) {
  const included = formatCount(balance?.usage.included ?? 0);
  const used = !balance
    ? 'Ai folosit creditele pentru importuri.'
    : balance.trial
      ? `Ai folosit cele ${included} de credite ale perioadei de probă.`
      : `Ai folosit cele ${included} de credite ale lunii${balance.hadGift ? ' și pe cele de bun venit' : ''}.`;
  const renewal = balance ? renewalSentence(balance, kind) : null;
  const what = kind === 'client' ? 'din documente' : 'din fișe';
  return {
    title: 'Nu mai ai credite pentru importuri',
    text: `${used}${renewal ? ` ${renewal}` : ''} Până atunci nu poți porni un import nou ${what}.`,
  };
}

export function refusalSentence(short: CreditsShort) {
  const until = short.renewsAt ? ` până pe ${creditsDay(short.renewsAt)}` : '';
  return short.left <= 0
    ? `Nu mai ai credite pentru importuri${until}. Scrie-ne la contact@ssmusor.ro și îți adăugăm credite.`
    : `Nu ajung creditele: importul folosește ${creditsLabel(short.needed)}, iar ție ${short.left === 1 ? 'îți mai rămâne' : 'îți mai rămân'} ${formatCount(short.left)}${until}. Scrie-ne la contact@ssmusor.ro și îți adăugăm credite.`;
}

export function usedSentence(credits: ImportCredits, kind: ImportKind) {
  const total = `Importul a folosit ${creditsLabel(credits.used)}`;
  if (kind === 'employees' || credits.scannedPages === 0 || credits.refunded) return `${total}.`;
  return `${total} (${credits.atStart} + ${scannedPagesLabel(credits.scannedPages)}).`;
}

export const overSentence = (over: number) =>
  `Ai trecut cu ${formatCount(over)} peste cele rămase; le scădem din creditele lunii viitoare.`;

export const refundedSentence = 'Creditele ți-au fost returnate.';
