import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

import { createSubscription, getBilling } from '@/api/generated/api';
import { ApiHttpError, type ApiRequestOptions } from '@/api/http';
import { Notice } from '@/components/notice';

import { billingErrorMessage } from '../billing-errors';
import { choiceAmounts, shortPlanNames } from '../billing-format';
import { BillingCard } from '../billing-ui';
import { roDate } from '../subscription-copy';
import { billingPreviewKey, hasLiveSubscription, refreshBilling } from '../use-billing';
import { ctaLabel } from './checkout-choice';
import { CheckoutFrame, type CheckoutState } from './checkout-frame';
import { CheckoutSummary } from './checkout-summary';
import { appearance, fonts, getStripe, returnUrl } from './stripe';

const pollMs = 1500;
const pollTries = 40;

// A paid first invoice reaches us through Stripe's webhook, a moment after the browser knows,
// and now and then a minute after.
async function waitForSubscription(request: ApiRequestOptions) {
  for (let attempt = 0; attempt < pollTries; attempt += 1) {
    const overview = await getBilling(request);
    const subscription = overview.subscription;
    // Stripe puts the card on the subscription a moment after the bank confirms it; until then
    // the tab would warn that the card was never confirmed.
    if (
      hasLiveSubscription(subscription) &&
      subscription?.access === 'full' &&
      overview.owner?.card
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

export default function StripeCheckout({
  state,
  heading,
  picker,
  onBusy,
  onDone,
}: {
  state: CheckoutState;
  heading: ReactNode;
  picker: ReactNode;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const configured = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  const dueNow = state.preview
    ? state.preview.dueToday.totalCents
    : state.readOnly
      ? choiceAmounts(state.choice).totalCents
      : 0;
  const options: StripeElementsOptions =
    dueNow > 0
      ? {
          mode: 'subscription',
          amount: dueNow,
          currency: 'eur',
          allowedPaymentMethodTypes: ['card'],
          locale: 'ro',
          appearance,
          fonts,
        }
      : {
          mode: 'setup',
          currency: 'eur',
          allowedPaymentMethodTypes: ['card'],
          locale: 'ro',
          appearance,
          fonts,
        };

  if (!configured) {
    return (
      <CheckoutFrame
        heading={heading}
        picker={picker}
        card={
          <BillingCard title="Cardul">
            <Notice variant="warning">
              Plata cu cardul nu este disponibilă acum. Încearcă din nou mai târziu.
            </Notice>
          </BillingCard>
        }
        summary={
          <CheckoutSummary
            mode="new"
            choice={state.choice}
            preview={state.preview}
            settling={state.settling}
            inTrial={false}
            readOnly={state.readOnly}
          >
            <Button className="h-12 rounded-xl text-[15px] font-semibold" disabled>
              {ctaLabel('new', state.choice, state.preview)}
            </Button>
          </CheckoutSummary>
        }
      />
    );
  }

  return (
    <Elements stripe={getStripe()} options={options}>
      <CheckoutForm
        elementsIntent={dueNow > 0 ? 'payment' : 'setup'}
        state={state}
        heading={heading}
        picker={picker}
        onBusy={onBusy}
        onDone={onDone}
      />
    </Elements>
  );
}

const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError ? (cause.body as { reason?: unknown } | null)?.reason : undefined;

function CheckoutForm({
  elementsIntent,
  state,
  heading,
  picker,
  onBusy,
  onDone,
}: {
  elementsIntent: 'payment' | 'setup';
  state: CheckoutState;
  heading: ReactNode;
  picker: ReactNode;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'paying' | 'confirming' | 'processing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { choice, preview } = state;
  const name = shortPlanNames[choice.plan];
  const blocked =
    !stripe ||
    !elements ||
    !ready ||
    !preview ||
    state.settling ||
    preview.problems.length > 0 ||
    phase !== 'idle';

  async function submit() {
    if (!stripe || !elements || !preview) return;
    setError(null);
    setPhase('paying');
    onBusy(true);
    let next: typeof phase = 'idle';
    try {
      const { error: invalid } = await elements.submit();
      if (invalid) {
        setError(invalid.message ?? 'Verifică datele cardului.');
        return;
      }
      const { clientSecret, intent } = await createSubscription(choice, apiRequest);
      // The form was set up for what the preview said; a payment cannot be confirmed through a
      // card form made for saving a card, nor the other way round. The next attempt replaces
      // what this one made.
      if (clientSecret && intent !== elementsIntent) {
        setError(
          'Între timp s-a schimbat ce plătești azi. Verifică rezumatul și încearcă din nou.'
        );
        await queryClient.invalidateQueries({ queryKey: billingPreviewKey });
        return;
      }
      if (clientSecret) {
        const confirmation = {
          elements,
          clientSecret,
          confirmParams: { return_url: returnUrl() },
          redirect: 'if_required' as const,
        };
        const { error: refused } =
          intent === 'setup'
            ? await stripe.confirmSetup(confirmation)
            : await stripe.confirmPayment(confirmation);
        if (refused) {
          setError(
            refused.message ??
              'Banca nu a confirmat plata. Încearcă din nou sau folosește alt card.'
          );
          return;
        }
      }
      setPhase('confirming');
      const settled = await waitForSubscription(apiRequest);
      await refreshBilling(queryClient);
      if (!settled) {
        next = 'processing';
        return;
      }
      toast.success(
        preview.dueToday.totalCents === 0
          ? `Ai ales ${name}. Azi nu ai plătit nimic; prima plată e pe ${roDate(preview.firstChargeAt)}.`
          : `Plata a reușit. Abonamentul ${name} e activ.`
      );
      onDone();
    } catch (cause) {
      if (reasonOf(cause) === 'already_subscribed') {
        await refreshBilling(queryClient);
        toast.info(billingErrorMessage(cause));
        onDone();
        return;
      }
      setError(billingErrorMessage(cause));
    } finally {
      setPhase(next);
      onBusy(next === 'processing');
    }
  }

  return (
    <CheckoutFrame
      heading={heading}
      picker={picker}
      card={
        <BillingCard title="Cardul" data-testid="card-section">
          <PaymentElement
            options={{
              layout: 'tabs',
              wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
            }}
            onReady={() => setReady(true)}
            onLoadError={() =>
              setError('Formularul cardului nu s-a încărcat. Reîncarcă pagina și încearcă din nou.')
            }
          />
        </BillingCard>
      }
      summary={
        <CheckoutSummary
          mode="new"
          choice={choice}
          preview={preview}
          settling={state.settling}
          inTrial={false}
          readOnly={state.readOnly}
        >
          {state.previewError && <Notice variant="destructive">{state.previewError}</Notice>}
          {error && (
            <Notice variant="destructive" data-testid="checkout-error">
              {error}
            </Notice>
          )}
          {phase === 'processing' && (
            <Notice
              variant="info"
              data-testid="checkout-processing"
              title="Plata se procesează."
              action={
                <Button variant="outline" onClick={onDone}>
                  Înapoi la abonament
                </Button>
              }
            >
              Banca a confirmat plata, iar abonamentul apare pe pagina lui în câteva minute. Nu
              alege din nou un plan: plata nu se face de două ori.
            </Notice>
          )}
          <Button
            className="h-12 rounded-xl text-[15px] font-semibold"
            data-testid="checkout-submit"
            disabled={blocked}
            onClick={() => void submit()}
          >
            {phase === 'paying'
              ? 'Se confirmă cu banca…'
              : phase === 'confirming' || phase === 'processing'
                ? 'Se activează abonamentul…'
                : ctaLabel('new', choice, preview)}
          </Button>
        </CheckoutSummary>
      }
    />
  );
}
