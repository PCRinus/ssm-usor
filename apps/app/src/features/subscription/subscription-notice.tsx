import type { SubscriptionSummary } from '@ssm-usor/contracts';

import { Notice } from '@/components/notice';

import {
  contactEmail,
  daysUntil,
  endedSentence,
  inDaysLabel,
  roDate,
  trialNoticeDays,
} from './subscription-copy';

export function SubscriptionNotice({
  subscription,
  isOwner,
  impersonating,
  className,
}: {
  subscription: SubscriptionSummary | null | undefined;
  isOwner: boolean;
  // Support acting as the owner is not told to write to itself.
  impersonating: boolean;
  className?: string;
}) {
  if (!subscription) return null;

  const contact = (
    <a className="underline" href={`mailto:${contactEmail}`}>
      {contactEmail}
    </a>
  );

  if (subscription.access === 'read_only') {
    return (
      <Notice
        variant="warning"
        data-testid="subscription-read-only"
        className={className}
        title="Contul este doar pentru citire"
      >
        {endedSentence(subscription)} Poți vedea și descărca tot ce ai
        {subscription.deletesAt && ` până pe ${roDate(subscription.deletesAt)}`}; după aceea datele
        se șterg.{' '}
        {impersonating ? null : isOwner ? (
          <>Ca să continui, scrie-ne la {contact}.</>
        ) : (
          'Administratorul organizației poate reactiva contul.'
        )}
      </Notice>
    );
  }

  if (subscription.status !== 'trialing' || !subscription.trialEndsAt) return null;
  const days = daysUntil(subscription.trialEndsAt);
  if (days > trialNoticeDays) return null;

  return (
    <Notice
      variant="info"
      data-testid="subscription-trial-ending"
      className={className}
      title={`Perioada de probă se încheie ${inDaysLabel(days)}`}
    >
      Până pe {roDate(subscription.trialEndsAt)} ai tot ce include planul Profesional. După aceea,
      contul rămâne doar pentru citire.{' '}
      {impersonating ? null : isOwner ? (
        <>Ca să continui, scrie-ne la {contact}.</>
      ) : (
        'Administratorul organizației alege cum continuați.'
      )}
    </Notice>
  );
}
