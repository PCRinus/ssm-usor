import { type Appearance, loadStripe, type Stripe } from '@stripe/stripe-js';

import { subscriptionPath } from '../subscription-copy';

let stripe: Promise<Stripe | null> | null = null;

export function getStripe() {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);
  stripe ??= loadStripe(key, { locale: 'ro' });
  return stripe;
}

export function returnUrl() {
  return new URL(subscriptionPath, window.location.origin).href;
}

export const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#18342e',
    colorText: '#18342e',
    colorTextSecondary: '#65736d',
    colorTextPlaceholder: '#65736d',
    colorBackground: '#ffffff',
    colorDanger: '#b42318',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSizeBase: '15px',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { borderColor: '#ccd6ce', boxShadow: 'none' },
    '.Input:focus': { borderColor: '#18342e', boxShadow: '0 0 0 3px rgba(182, 216, 111, 0.6)' },
    '.Label': { color: '#30443e', fontWeight: '500' },
    '.Tab': { borderColor: '#d4ddd5', boxShadow: 'none' },
    '.Tab--selected': { borderColor: '#18342e', boxShadow: '0 0 0 1px #18342e' },
  },
};

export const fonts = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' },
];

export type ConfirmOutcome = { ok: true } | { ok: false; message: string | null };

// An annual change is charged at once with the saved card; the bank may still ask the owner to
// confirm it, which only the browser can do.
export async function confirmSavedCardPayment(clientSecret: string): Promise<ConfirmOutcome> {
  const client = await getStripe();
  if (!client) return { ok: false, message: null };
  const { paymentIntent, error } = await client.retrievePaymentIntent(clientSecret);
  if (error) return { ok: false, message: error.message ?? null };
  if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
    return { ok: true };
  }
  const result =
    paymentIntent.status === 'requires_action'
      ? await client.handleNextAction({ clientSecret })
      : await client.confirmPayment({
          clientSecret,
          confirmParams: { return_url: returnUrl() },
          redirect: 'if_required',
        });
  return result.error ? { ok: false, message: result.error.message ?? null } : { ok: true };
}
