import { billingPlans, type ImportKind } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Coins, Gift, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { formatCount } from '@/features/subscription/billing-format';
import { contactEmail } from '@/features/subscription/subscription-copy';

import {
  type CreditsBalance,
  type CreditsRefusal,
  leftSentence,
  noneText,
  overSentence,
  shortText,
  usedSentence,
} from './import-credits';
import { useCreditsBalance } from './use-credits-balance';

export function CreditsLine({
  uses,
  balance,
  short,
  className,
}: {
  uses: string;
  balance: CreditsBalance | null;
  short: boolean;
  className?: string;
}) {
  return (
    <p
      data-testid="import-credits-line"
      data-short={short || undefined}
      className={cn(
        'text-[13.5px] leading-snug tabular-nums',
        short && 'text-destructive',
        className
      )}
    >
      <span className="font-semibold">{uses}</span>
      {balance && (
        <>
          {' '}
          <span className={short ? undefined : 'text-muted-foreground'}>
            {leftSentence(balance, short)}
          </span>
        </>
      )}
    </p>
  );
}

function Hint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-[13.5px] leading-normal text-muted-foreground [&_svg]:mt-0.5 [&_svg]:size-4">
      {icon}
      <span>{children}</span>
    </p>
  );
}

export function ContactHint() {
  return (
    <Hint icon={<Mail aria-hidden="true" />}>
      Ai nevoie de credite mai devreme? Scrie-ne la{' '}
      <a
        href={`mailto:${contactEmail}`}
        className="font-semibold text-foreground underline-offset-2 hover:underline"
      >
        {contactEmail}
      </a>{' '}
      și îți adăugăm credite.
    </Hint>
  );
}

const subscriptionLink = (
  <Button asChild variant="outline" size="sm" className="bg-card">
    <Link to="/organization/subscription" data-testid="import-credits-subscription">
      Deschide Abonament
    </Link>
  </Button>
);

export function CreditsShortNotice({
  kind,
  refusal,
  balance,
  isOwner,
  withPages = false,
}: {
  kind: ImportKind;
  refusal: Extract<CreditsRefusal, { kind: 'short' }>;
  balance: CreditsBalance | null;
  isOwner: boolean;
  withPages?: boolean;
}) {
  const { title, text } = shortText(kind, refusal, balance, withPages);
  return (
    <Notice
      variant="destructive"
      title={title}
      data-testid="import-credits-short"
      action={isOwner ? subscriptionLink : undefined}
    >
      <span className="tabular-nums">{text}</span>
    </Notice>
  );
}

export function NoCreditsNotices({
  kind,
  balance,
}: {
  kind: ImportKind;
  balance: CreditsBalance | null;
}) {
  const { title, text } = noneText(kind, balance);
  return (
    <>
      <Notice variant="destructive" title={title} data-testid="import-credits-none">
        <span className="tabular-nums">{text}</span>
      </Notice>
      <ContactHint />
      {kind === 'client' && (
        <Hint icon={<Coins aria-hidden="true" />}>
          Importurile pornite deja merg până la capăt. Dacă găsesc mai multe pagini scanate decât
          credite, diferența se scade din creditele lunii viitoare.
        </Hint>
      )}
    </>
  );
}

export function NoCreditsFooter({ isOwner, onClose }: { isOwner: boolean; onClose: () => void }) {
  return (
    <>
      {isOwner && (
        <span className="sm:mr-auto [&>*]:w-full sm:[&>*]:w-auto">{subscriptionLink}</span>
      )}
      <Button type="button" onClick={onClose}>
        Închide
      </Button>
    </>
  );
}

export function GiftHint({ balance }: { balance: CreditsBalance | null }) {
  if (!balance?.trial) return null;
  const pending = balance.usage.giftPending;
  return (
    <Hint icon={<Gift aria-hidden="true" />}>
      {pending > 0 ? (
        <>
          La prima plată primești și{' '}
          <b className="font-semibold text-foreground">
            {formatCount(pending)} de credite de bun venit
          </b>
          , ca să-ți aduci toți clienții în aplicație. Nu expiră.
        </>
      ) : (
        <>
          La prima plată primești și{' '}
          <b className="font-semibold text-foreground">creditele de bun venit</b>, ca să-ți aduci
          toți clienții în aplicație: {formatCount(billingPlans.start.welcomeCredits)} cu Start sau{' '}
          {formatCount(billingPlans.profesional.welcomeCredits)} cu Profesional. Nu expiră.
        </>
      )}
    </Hint>
  );
}

export function CreditsUsedLine({ detail, kind }: { detail: ImportDetail; kind: ImportKind }) {
  const { balance } = useCreditsBalance();
  if (!detail.credits || detail.credits.refunded) return null;
  const over = kind === 'client' && balance && balance.available < 0 ? -balance.available : 0;
  return (
    <p
      data-testid="import-credits-used"
      className="flex items-start gap-2 text-muted-foreground tabular-nums"
    >
      <Coins className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {usedSentence(detail.credits, kind)}
        {over > 0 && ` ${overSentence(over)}`}
      </span>
    </p>
  );
}
