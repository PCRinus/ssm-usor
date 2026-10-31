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
      return route ? route(init) : Response.json(previewFor(choice));
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
  mountApp(authFixture(makeSession()).client, `/organization/subscription/choose${search}`);

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

const chosenTrial = (): NonNullable<BillingOverview['subscription']> => ({
  ...trialSubscription(12),
  plan: 'start',
  planChosen: true,
  interval: 'month',
  employeePacks: 2,
});

describe('choosing a plan', () => {
  it('saves the card in a trial and charges nothing today', async () => {
    const trial = overviewWith({ subscription: trialSubscription(12), owner: ownerPart() });
    mockApi({
      overview: trial,
      after: overviewWith({ subscription: chosenTrial(), owner: ownerPart({ card: savedCard }) }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'seti_secret_1', intent: 'setup' }, { status: 201 }),
      },
    });
    const runtime = mount();

    const page = await screen.findByTestId('choose-plan-page');
    expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe('Alege planul');
    expect(screen.getByTestId('plan-option-start').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('packs-value').textContent).toBe('2');
    expect((screen.getByTestId('packs-less') as HTMLButtonElement).disabled).toBe(true);
    expect((await screen.findByTestId('checkout-total')).textContent).toBe('83,49 €');
    expect(await screen.findByText('Azi nu plătești nimic.')).toBeTruthy();
    expect(
      screen.getByText(/La prima plată primești 2\.500 de credite de bun venit\.$/)
    ).toBeTruthy();
    expect(screen.getByTestId('plan-option-start').textContent).toContain(
      '300 de credite pentru import pe lună, plus 2.500 la prima plată'
    );
    expect(screen.getByTestId('plan-option-profesional').textContent).toContain(
      '1.500 de credite pentru import pe lună, plus 10.000 la prima plată'
    );
    await screen.findByTestId('payment-element');
    expect(stripe.elementsOptions.at(-1)).toMatchObject({
      mode: 'setup',
      currency: 'eur',
      locale: 'ro',
      allowedPaymentMethodTypes: ['card'],
    });

    const user = userEvent.setup();
    const submit = await screen.findByRole('button', { name: 'Salvează cardul și alege Start' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await user.click(submit);

    await waitFor(() => expect(stripe.confirmSetup).toHaveBeenCalledTimes(1));
    expect(stripe.submit).toHaveBeenCalledTimes(1);
    expect(bodyOf('/billing/subscription', 'POST')).toEqual({
      plan: 'start',
      interval: 'month',
      employeePacks: 2,
      extraMembers: 0,
    });
    expect(stripe.confirmSetup).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'seti_secret_1', redirect: 'if_required' })
    );
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organization/subscription')
    );
    expect(await screen.findByText(/Azi nu ai plătit nimic; prima plată e pe/)).toBeTruthy();
  });

  it('waits for the card to reach the subscription before saying the plan is chosen', async () => {
    const trial = overviewWith({ subscription: trialSubscription(12), owner: ownerPart() });
    const withoutCardYet = overviewWith({ subscription: chosenTrial(), owner: ownerPart() });
    const withCard = overviewWith({
      subscription: chosenTrial(),
      owner: ownerPart({ card: savedCard }),
    });
    let chosen = false;
    let readsAfterChoosing = 0;
    mockApi({
      overview: trial,
      routes: {
        'POST /billing/subscription': () => {
          chosen = true;
          return Response.json({ clientSecret: 'seti_secret_1', intent: 'setup' }, { status: 201 });
        },
        'GET /billing': () => {
          if (!chosen) return Response.json(trial);
          readsAfterChoosing += 1;
          return Response.json(readsAfterChoosing <= 2 ? withoutCardYet : withCard);
        },
      },
    });
    const runtime = mount();

    const user = userEvent.setup();
    const submit = await screen.findByRole('button', { name: 'Salvează cardul și alege Start' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await user.click(submit);

    await waitFor(
      () => expect(runtime.router.state.location.pathname).toBe('/organization/subscription'),
      { timeout: 8000 }
    );
    expect((await screen.findByTestId('payment-card-number')).textContent).toBe('Visa •••• 4242');
    expect(screen.getByTestId('subscription-notice').textContent).not.toContain(
      'Cardul nu a fost confirmat.'
    );
  });

  it('charges at once when reactivating, and keeps the page on a declined card', async () => {
    const ended = overviewWith({
      subscription: activeSubscription({
        plan: 'start',
        status: 'canceled',
        interval: 'month',
        employeePacks: 2,
        extraMembers: 0,
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
              dueToday: 6900,
              firstChargeAt: new Date().toISOString(),
            })
          ),
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_1', intent: 'payment' }, { status: 201 }),
      },
    });
    const runtime = mount();

    const submit = await screen.findByRole('button', { name: 'Plătește 83,49 €' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(stripe.elementsOptions.at(-1)).toMatchObject({ mode: 'subscription', amount: 8349 });
    await userEvent.click(submit);

    expect((await screen.findByTestId('checkout-error')).textContent).toContain(
      'Cardul a fost refuzat.'
    );
    expect(stripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_secret_1' })
    );
    expect(runtime.router.state.location.pathname).toBe('/organization/subscription/choose');
  });

  it('offers the card form again for a plan chosen in the trial whose card never confirmed, and keeps it while the bank confirms', async () => {
    const card = { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };
    mockApi({
      overview: overviewWith({ subscription: chosenTrial(), owner: ownerPart() }),
      after: overviewWith({ subscription: chosenTrial(), owner: ownerPart({ card }) }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'seti_secret_2', intent: 'setup' }, { status: 201 }),
      },
    });
    const runtime = mount();
    const seenDuringConfirmation: (string | null)[] = [];
    stripe.confirmSetup.mockImplementationOnce(async () => {
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
    const submit = await screen.findByRole('button', { name: 'Salvează cardul și alege Start' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    await waitFor(() => expect(seenDuringConfirmation).toHaveLength(2));
    expect(requests('/billing/subscription', 'POST')).toHaveLength(1);
    expect(seenDuringConfirmation).toEqual(['Alege planul', 'card form']);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organization/subscription')
    );
  });

  it('confirms nothing when the server asks for a payment the card form was not made for', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialSubscription(12), owner: ownerPart() }),
      routes: {
        'POST /billing/subscription': () =>
          Response.json({ clientSecret: 'pi_secret_3', intent: 'payment' }, { status: 201 }),
      },
    });
    mount();

    const submit = await screen.findByRole('button', { name: 'Salvează cardul și alege Start' });
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
    const runtime = mount();

    const submit = await screen.findByRole('button', { name: 'Salvează cardul și alege Start' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organization/subscription')
    );
    expect(await screen.findByText(/Planul ales mai devreme e deja plătit și activ/)).toBeTruthy();
    expect(stripe.confirmSetup).not.toHaveBeenCalled();
  });

  it('keeps Start out of reach past its ceiling, and never below the packs needed', async () => {
    mockApi({
      overview: overviewWith({
        subscription: trialSubscription(12),
        employees: 1740,
        owner: ownerPart({
          choices: {
            start: {
              minimums: { employeePacks: 30, extraMembers: 0 },
              problems: [{ reason: 'start_employee_ceiling' }],
            },
            profesional: { minimums: { employeePacks: 1, extraMembers: 0 }, problems: [] },
          },
        }),
      }),
    });
    mount();

    const start = await screen.findByTestId('plan-option-start');
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(start.textContent).toContain('Start acoperă cel mult 600 de angajați.');
    expect(screen.getByTestId('plan-option-profesional').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('packs-value').textContent).toBe('1');
    expect((screen.getByTestId('packs-less') as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByTestId('packs-more'));
    expect(screen.getByTestId('packs-value').textContent).toBe('2');
    await waitFor(() =>
      expect(bodyOf('/billing/preview', 'POST')).toEqual({
        plan: 'profesional',
        interval: 'month',
        employeePacks: 2,
        extraMembers: 0,
      })
    );
  });

  it('changes a running plan with a confirmation and no card form', async () => {
    const subscription = activeSubscription({
      plan: 'start',
      interval: 'month',
      employeePacks: 2,
      extraMembers: 1,
    });
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart(),
        limits: { employees: 350, members: 2, sms: 50 },
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
    expect(dialog.textContent).toContain('2 pachete de angajați nu mai sunt necesare');
    expect(dialog.textContent).toContain('Un utilizator în plus nu mai este necesar');
    await userEvent.click(within(dialog).getByTestId('change-confirm'));

    await waitFor(() => expect(requests('/billing/subscription', 'PATCH')).toHaveLength(1));
    expect(bodyOf('/billing/subscription', 'PATCH')).toEqual({
      plan: 'profesional',
      interval: 'month',
      employeePacks: 0,
      extraMembers: 0,
    });
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/organization/subscription')
    );
  });

  it('shows no amount due today next to a change it refuses', async () => {
    const subscription = activeSubscription({
      plan: 'profesional',
      interval: 'year',
      employeePacks: 0,
      extraMembers: 2,
    });
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

  it('shows the difference for the days left when a change adds now and removes at the renewal', async () => {
    const subscription = activeSubscription({
      interval: 'month',
      employeePacks: 0,
      extraMembers: 1,
    });
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              appliesAt: subscription.currentPeriodEnd!,
              proration: { subtotalCents: 2250, chargedNow: false },
            })
          ),
      },
    });
    mount();

    await userEvent.click(await screen.findByTestId('packs-more'));
    await userEvent.click(screen.getByTestId('members-less'));
    const submit = screen.getByTestId('checkout-submit');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    const dialog = await screen.findByTestId('change-dialog');
    await within(dialog).findByText(/Ce adaugi se aplică azi/);
    expect(dialog.textContent).toContain('Diferența pentru zilele rămase');
    expect(dialog.textContent).toContain('22,50 € + TVA');
  });

  it('starts from a link that adds one pack', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          plan: 'start',
          interval: 'month',
          employeePacks: 2,
          extraMembers: 0,
        }),
        employees: 362,
        owner: ownerPart({
          choices: {
            start: { minimums: { employeePacks: 3, extraMembers: 0 }, problems: [] },
            profesional: { minimums: { employeePacks: 0, extraMembers: 0 }, problems: [] },
          },
        }),
      }),
    });
    mount('?packs=3');

    expect((await screen.findByTestId('packs-value')).textContent).toBe('3');
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
      'Doar administratorul organizației alege și schimbă planul.'
    );
  });
});
