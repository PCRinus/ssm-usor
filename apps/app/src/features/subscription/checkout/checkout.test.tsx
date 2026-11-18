import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetBillingQueryKey } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  activeSubscription,
  meFor,
  overviewWith,
  ownerPart,
  previewFor,
  summaryOf,
  trialSubscription,
} from '@/test/billing-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const stripe = vi.hoisted(() => ({
  submit: vi.fn(async () => ({ error: undefined as { message?: string } | undefined })),
  confirmSetup: vi.fn(async () => ({ error: undefined as { message?: string } | undefined })),
  confirmPayment: vi.fn(async () => ({ error: undefined as { message?: string } | undefined })),
  elementsOptions: [] as unknown[],
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(async () => ({
    confirmSetup: stripe.confirmSetup,
    confirmPayment: stripe.confirmPayment,
  })),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children, options }: { children: ReactNode; options: unknown }) => {
    stripe.elementsOptions.push(options);
    return children;
  },
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    useEffect(() => onReady?.(), [onReady]);
    return <div data-testid="payment-element" />;
  },
  useStripe: () => ({ confirmSetup: stripe.confirmSetup, confirmPayment: stripe.confirmPayment }),
  useElements: () => ({ submit: stripe.submit }),
}));

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  overview,
  after,
  routes = {},
}: {
  overview: BillingOverview;
  // What GET /billing answers once a plan was bought or changed.
  after?: BillingOverview;
  routes?: Record<string, Route>;
}) {
  let current = overview;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/billing/preview' && method === 'POST') {
      const choice = JSON.parse(String(init?.body)) as BillingChoice;
      const route = routes['POST /billing/preview'];
      if (route) return route(init);
      const subscription = current.subscription;
      const buying = !subscription?.planChosen || subscription.status === 'trialing';
      return Response.json(buying ? purchasePreview(choice) : previewFor(choice));
    }
    const route = routes[`${method} ${pathname}`];
    if (route) {
      if (after) current = after;
      return route(init);
    }
    if (pathname === '/me') {
      return Response.json(meFor({ subscription: summaryOf(current.subscription) }));
    }
    if (pathname === '/billing' && method === 'GET') return Response.json(current);
    return Response.json({ error: 'not_found', message: 'Not found' }, { status: 404 });
  });
}

const requests = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const bodyOf = (pathname: string, method: string) =>
  JSON.parse(String(requests(pathname, method).at(-1)?.[1]?.body)) as unknown;

const mount = (search = '') =>
  mountApp(authFixture(makeSession()).client, `/organizatie/abonament/alege${search}`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_checkout');
  stripe.submit.mockClear();
  stripe.confirmSetup.mockClear();
  stripe.confirmPayment.mockClear();
  stripe.elementsOptions.length = 0;
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const savedCard = { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };

function purchasePreview(choice: BillingChoice) {
  const now = new Date().toISOString();
  const { recurring } = previewFor(choice);
  return previewFor(choice, {
    dueToday: recurring.subtotalCents,
    appliesAt: now,
    firstChargeAt: now,
  });
}

const paidStart = () =>
  overviewWith({
    subscription: activeSubscription({ plan: 'start', interval: 'month', step: 500 }),
    owner: ownerPart({ card: savedCard }),
  });

const chosenTrial = (): NonNullable<BillingOverview['subscription']> => ({
  ...trialSubscription(12),
  plan: 'start',
  planChosen: true,
  interval: 'month',
  step: 500,
});

describe('choosing a plan', () => {
  it('charges a plan chosen in a trial now, annual unless chosen otherwise, and says the trial ends with the payment', async () => {
    const trial = overviewWith({ subscription: trialSubscription(12), owner: ownerPart() });
    mockApi({
      overview: trial,
      after: paidStart(),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_1', intent: 'payment' }, { status: 201 }),
      },
    });
    const runtime = mount();

    const page = await screen.findByTestId('choose-plan-page');
    expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe('Alege planul');
    expect(document.querySelector('[data-slot="tab-sheet"]')).toBeNull();
    expect(screen.getByTestId('plan-option-start').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('step-value').textContent).toBe('500');
    expect((screen.getByTestId('step-less') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('interval-year').getAttribute('aria-pressed')).toBe('true');
    expect(
      screen
        .getByTestId('interval-year')
        .compareDocumentPosition(screen.getByTestId('interval-month'))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('interval-year').textContent).toBe('Anualdouă luni gratuite');
    expect((await screen.findByTestId('checkout-total')).textContent).toBe('711,48 €');
    expect(await screen.findByText('Plătești azi 711,48 €.')).toBeTruthy();
    expect(
      screen.getByText(/Odată cu plata primești 5\.000 de credite AI de bun venit\.$/)
    ).toBeTruthy();
    expect(screen.getByTestId('checkout-trial-ends').textContent).toBe(
      'Plata încheie perioada de probă: zilele de probă rămase nu se păstrează.'
    );
    expect(screen.getByTestId('plan-option-start').textContent).toContain(
      '100 de coduri SMS și 1.250 de credite AI pe lună'
    );
    expect(screen.getByTestId('plan-option-start').textContent).toContain(
      '5.000 de credite AI de bun venit, la prima plată'
    );
    expect(screen.getByTestId('plan-option-start').textContent).toContain('49 €');
    expect(screen.getByTestId('plan-option-profesional').textContent).toContain(
      '100 de coduri SMS și 1.250 de credite AI pe lună'
    );
    expect(screen.getByTestId('plan-option-profesional').textContent).toContain('74 €');
    await screen.findByTestId('payment-element');
    expect(stripe.elementsOptions.at(-1)).toMatchObject({
      mode: 'subscription',
      amount: 71148,
      currency: 'eur',
      locale: 'ro',
      allowedPaymentMethodTypes: ['card'],
    });

    const user = userEvent.setup();
    const submit = await screen.findByRole('button', { name: 'Plătește 711,48 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await user.click(submit);

    await waitFor(() => expect(stripe.confirmPayment).toHaveBeenCalledTimes(1));
    expect(stripe.submit).toHaveBeenCalledTimes(1);
    expect(stripe.confirmSetup).not.toHaveBeenCalled();
    expect(bodyOf('/billing/subscription', 'POST')).toEqual({
      plan: 'start',
      step: 500,
      interval: 'year',
    });
    expect(stripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_secret_1', redirect: 'if_required' })
    );
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament')
    );
    expect(
      await screen.findByText(
        'Plata a reușit. Abonamentul Start e activ, iar perioada de probă s-a încheiat.'
      )
    ).toBeTruthy();
  });

  it('keeps the trial when the bank does not confirm the first payment', async () => {
    const trial = overviewWith({ subscription: trialSubscription(12), owner: ownerPart() });
    stripe.confirmPayment.mockResolvedValueOnce({
      error: { message: 'Autentificarea plății nu a reușit.' },
    });
    mockApi({
      overview: trial,
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_1', intent: 'payment' }, { status: 201 }),
      },
    });
    const runtime = mount('?interval=month');

    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    expect((await screen.findByTestId('checkout-error')).textContent).toContain(
      'Autentificarea plății nu a reușit.'
    );
    expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament/alege');
    expect(screen.getByTestId('checkout-trial-ends')).toBeTruthy();
  });

  it('waits for the paid subscription and its card before saying the plan is active', async () => {
    const trial = overviewWith({ subscription: trialSubscription(12), owner: ownerPart() });
    const paid = paidStart();
    let chosen = false;
    let readsAfterChoosing = 0;
    mockApi({
      overview: trial,
      routes: {
        'POST /billing/subscription': () => {
          chosen = true;
          return Response.json({ clientSecret: 'pi_secret_1', intent: 'payment' }, { status: 201 });
        },
        'GET /billing': () => {
          if (!chosen) return Response.json(trial);
          readsAfterChoosing += 1;
          return Response.json(readsAfterChoosing <= 2 ? trial : paid);
        },
      },
    });
    const runtime = mount('?interval=month');

    const user = userEvent.setup();
    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await user.click(submit);

    await waitFor(
      () => expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament'),
      { timeout: 8000 }
    );
    expect((await screen.findByTestId('payment-card-number')).textContent).toBe('Visa •••• 4242');
    expect(readsAfterChoosing).toBeGreaterThan(2);
  });

  it('charges at once when reactivating, and keeps the page on a declined card', async () => {
    const ended = overviewWith({
      subscription: activeSubscription({
        plan: 'start',
        status: 'canceled',
        interval: 'month',
        step: 500,
        access: 'read_only',
      }),
      owner: ownerPart(),
    });
    stripe.confirmPayment.mockResolvedValueOnce({
      error: { message: 'Cardul a fost refuzat.' },
    });
    mockApi({
      overview: ended,
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              dueToday: 5900,
              firstChargeAt: new Date().toISOString(),
            })
          ),
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_1', intent: 'payment' }, { status: 201 }),
      },
    });
    const runtime = mount();

    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(stripe.elementsOptions.at(-1)).toMatchObject({ mode: 'subscription', amount: 7139 });
    expect(screen.getByTestId('plan-option-start').textContent).not.toContain('de bun venit');
    expect(screen.getByTestId('checkout-summary').textContent).not.toContain('de bun venit');
    await userEvent.click(submit);

    expect((await screen.findByTestId('checkout-error')).textContent).toContain(
      'Cardul a fost refuzat.'
    );
    expect(stripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_secret_1' })
    );
    expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament/alege');
  });

  it('offers the card form again, charging now, for a plan chosen in the trial before 2026-11-14 whose card never confirmed, and keeps it while the bank confirms', async () => {
    const card = { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };
    mockApi({
      overview: overviewWith({ subscription: chosenTrial(), owner: ownerPart() }),
      after: overviewWith({
        subscription: activeSubscription({ plan: 'start', interval: 'month', step: 500 }),
        owner: ownerPart({ card }),
      }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_2', intent: 'payment' }, { status: 201 }),
      },
    });
    const runtime = mount();
    const seenDuringConfirmation: (string | null)[] = [];
    stripe.confirmPayment.mockImplementationOnce(async () => {
      await runtime.queryClient.refetchQueries({ queryKey: getGetBillingQueryKey() });
      await new Promise((resolve) => setTimeout(resolve, 50));
      seenDuringConfirmation.push(
        screen.getByRole('heading', { level: 1 }).textContent,
        screen.queryByTestId('payment-element') ? 'card form' : null
      );
      return { error: undefined };
    });

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Alege planul');
    await screen.findByTestId('payment-element');
    expect((await screen.findByTestId('checkout-trial-ends')).textContent).toBe(
      'Plata încheie perioada de probă: zilele de probă rămase nu se păstrează.'
    );
    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    await waitFor(() => expect(seenDuringConfirmation).toHaveLength(2));
    expect(requests('/billing/subscription', 'POST')).toHaveLength(1);
    expect(seenDuringConfirmation).toEqual(['Alege planul', 'card form']);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament')
    );
  });

  it('confirms nothing when the server asks for a payment the card form was not made for', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialSubscription(12), owner: ownerPart() }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'seti_secret_3', intent: 'setup' }, { status: 201 }),
      },
    });
    mount('?interval=month');

    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    expect((await screen.findByTestId('checkout-error')).textContent).toContain(
      'Între timp s-a schimbat ce plătești azi.'
    );
    expect(stripe.confirmPayment).not.toHaveBeenCalled();
    expect(stripe.confirmSetup).not.toHaveBeenCalled();
  });

  it('goes back to the tab when an earlier checkout already made the subscription', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialSubscription(12), owner: ownerPart() }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json(
            { error: 'conflict', message: 'Already.', reason: 'already_subscribed' },
            { status: 409 }
          ),
      },
    });
    const runtime = mount('?interval=month');

    const submit = await screen.findByRole('button', { name: 'Plătește 71,39 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament')
    );
    expect(await screen.findByText(/Planul ales mai devreme e deja plătit și activ/)).toBeTruthy();
    expect(stripe.confirmSetup).not.toHaveBeenCalled();
  });

  it('keeps Start out of reach past 750 employees, and the step never below the employees', async () => {
    mockApi({
      overview: overviewWith({
        subscription: trialSubscription(12),
        employees: 1740,
        owner: ownerPart({
          choices: {
            start: {
              minimumStep: null,
              problems: [{ reason: 'employees_over_plan', maximum: 750 }],
            },
            profesional: { minimumStep: 2000, problems: [] },
          },
        }),
      }),
    });
    mount();

    const start = await screen.findByTestId('plan-option-start');
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(start.textContent).toContain('Start acoperă cel mult 750 de lucrători.');
    expect(screen.getByTestId('plan-option-profesional').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('step-value').textContent).toBe('2.000');
    expect((screen.getByTestId('step-less') as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByTestId('step-more'));
    expect(screen.getByTestId('step-value').textContent).toBe('3.000');
    await waitFor(() =>
      expect(bodyOf('/billing/preview', 'POST')).toEqual({
        plan: 'profesional',
        step: 3000,
        interval: 'year',
      })
    );
  });

  it('moves to Profesional once the stop passes Start’s last step, with the site’s stops', async () => {
    mockApi({
      overview: overviewWith({
        subscription: trialSubscription(12),
        employees: 600,
        owner: ownerPart(),
      }),
    });
    mount();

    expect((await screen.findByTestId('step-value')).textContent).toBe('750');
    expect(screen.getByTestId('plan-option-start').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByTestId('step-more'));

    expect(screen.getByTestId('step-value').textContent).toBe('1.000');
    expect(screen.getByTestId('plan-option-profesional').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('plan-option-start') as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() =>
      expect(bodyOf('/billing/preview', 'POST')).toMatchObject({ plan: 'profesional', step: 1000 })
    );
  });

  it('shows the annual price as a month of ten twelfths, rounded down, and the year', async () => {
    mockApi({
      overview: overviewWith({
        subscription: trialSubscription(12),
        employees: 100,
        owner: ownerPart(),
      }),
    });
    mount('?interval=year');

    const start = await screen.findByTestId('plan-option-start');
    expect(start.textContent).toContain('32 €');
    expect(start.textContent).toContain('plătit anual: 384 € + TVA');
  });

  it('changes a running plan with a confirmation and no card form', async () => {
    const subscription = activeSubscription({ plan: 'start', interval: 'month', step: 500 });
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart(),
        limits: { employees: 500, members: 3, sms: 100 },
      }),
      routes: {
        'PATCH /billing/subscription': () => Response.json({ clientSecret: null, intent: null }),
      },
    });
    const runtime = mount();

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Schimbă planul');
    expect(screen.queryByTestId('payment-element')).toBeNull();
    await userEvent.click(screen.getByTestId('plan-option-profesional'));
    const submit = screen.getByTestId('checkout-submit');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    const dialog = await screen.findByTestId('change-dialog');
    expect(
      await within(dialog).findByRole('heading', { name: 'Treci la Profesional?' })
    ).toBeTruthy();
    expect(dialog.textContent).toContain('până la 500 de lucrători, 10 utilizatori');
    await userEvent.click(within(dialog).getByTestId('change-confirm'));

    await waitFor(() => expect(requests('/billing/subscription', 'PATCH')).toHaveLength(1));
    expect(bodyOf('/billing/subscription', 'PATCH')).toEqual({
      plan: 'profesional',
      step: 500,
      interval: 'month',
    });
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organizatie/abonament')
    );
  });

  it('shows no amount due today next to a change it refuses', async () => {
    const subscription = activeSubscription({ plan: 'profesional', interval: 'year', step: 2000 });
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              dueToday: 18150,
              problems: [{ reason: 'split_change' }],
            })
          ),
      },
    });
    mount();

    await screen.findByTestId('checkout-problem');
    expect(screen.queryByTestId('checkout-when')).toBeNull();
  });

  it('moves up a step at once, with the difference for the days left on the next invoice', async () => {
    const subscription = activeSubscription({ interval: 'month', step: 1500 });
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              appliesAt: new Date().toISOString(),
              proration: { subtotalCents: 2250, chargedNow: false },
            })
          ),
      },
    });
    mount();

    await userEvent.click(await screen.findByTestId('step-more'));
    const submit = screen.getByTestId('checkout-submit');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    const dialog = await screen.findByTestId('change-dialog');
    await within(dialog).findByRole('heading', {
      name: 'Treci la treapta de 2.000 de lucrători?',
    });
    expect(dialog.textContent).toContain('400 de coduri SMS și 4.250 de credite AI pe lună');
    expect(dialog.textContent).toContain('Diferența pentru zilele rămase');
    expect(dialog.textContent).toContain('22,50 € + TVA');
  });

  it('leaves a lower step for the renewal', async () => {
    const subscription = activeSubscription({ interval: 'month', step: 2000 });
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              appliesAt: subscription.currentPeriodEnd!,
            })
          ),
      },
    });
    mount();

    await userEvent.click(await screen.findByTestId('step-less'));
    const submit = screen.getByTestId('checkout-submit');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    const dialog = await screen.findByTestId('change-dialog');
    expect((await within(dialog).findByRole('heading', { level: 2 })).textContent).toMatch(
      /^Treci la treapta de 1\.500 de lucrători de pe /
    );
    expect(dialog.textContent).toContain('rămâi pe treapta de acum');
  });

  it('starts from a link to the next step', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({ plan: 'start', interval: 'month', step: 250 }),
        employees: 362,
        owner: ownerPart(),
      }),
    });
    mount('?step=500');

    expect((await screen.findByTestId('step-value')).textContent).toBe('500');
    expect(screen.getByTestId('plan-option-start').getAttribute('aria-pressed')).toBe('true');
  });

  it('tells a specialist only the owner chooses', async () => {
    fetchMock.mockImplementation(async (input) => {
      const { pathname } = new URL(String(input));
      if (pathname === '/me') return Response.json(meFor({ role: 'specialist' }));
      if (pathname === '/billing') {
        return Response.json(overviewWith({ subscription: trialSubscription(12) }));
      }
      return Response.json({}, { status: 404 });
    });
    mount();

    expect((await screen.findByTestId('choose-plan-owner-only')).textContent).toContain(
      'Doar adminul organizației alege și schimbă planul.'
    );
  });
});
