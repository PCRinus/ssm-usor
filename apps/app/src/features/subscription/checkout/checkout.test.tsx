import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      after: overviewWith({ subscription: chosenTrial(), owner: ownerPart() }),
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
      extraMembers: 0,
    });
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart(),
        limits: { employees: 350, members: 1, sms: 50 },
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
