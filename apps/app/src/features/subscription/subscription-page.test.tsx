import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  activeSubscription,
  creditsUsage,
  inDays,
  meFor,
  overviewWith,
  ownerPart,
  previewFor,
  smsUsage,
  summaryOf,
  trialChosenSubscription,
  trialSubscription,
} from '@/test/billing-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { leaveFor } from './leave';
import { roDate } from './subscription-copy';

vi.mock('./leave', () => ({ leaveFor: vi.fn() }));

type Route = (init: RequestInit | undefined) => Response;
type Owner = NonNullable<BillingOverview['owner']>;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  overview,
  role = 'owner',
  impersonating = false,
  routes = {},
  me = {},
}: {
  me?: Partial<Parameters<typeof meFor>[0]>;
  overview: BillingOverview;
  role?: 'owner' | 'specialist';
  impersonating?: boolean;
  routes?: Record<string, Route>;
}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${pathname}`];
    if (route) return route(init);
    if (pathname === '/me') {
      return Response.json(
        meFor({ role, impersonating, subscription: summaryOf(overview.subscription), ...me })
      );
    }
    if (pathname === '/billing' && method === 'GET') return Response.json(overview);
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

const mount = () => mountApp(authFixture(makeSession()).client, '/organizatie/abonament');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.mocked(leaveFor).mockClear();
});

describe('the Abonament tab', () => {
  it('sits after Abilitări and shows a trial without a plan', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialSubscription(12), owner: ownerPart() }),
    });
    mount();

    const card = await screen.findByTestId('plan-card');
    const tabs = screen.getAllByTestId('organization-section').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Echipă', 'Date firmă', 'Abilitări', 'Abonament']);
    expect(within(card).getByRole('heading', { name: 'Perioada de probă' })).toBeTruthy();
    expect(within(card).getByTestId('plan-amount').textContent).toContain('12 zile');
    expect(within(card).getByRole('link', { name: 'Alege un plan' }).getAttribute('href')).toBe(
      '/organizatie/abonament/alege'
    );
    expect(screen.getByTestId('meter-sms').textContent).toContain(
      'SMS-urile pornesc când alegi un plan'
    );
    expect(screen.getByTestId('meter-employees').textContent).toContain(
      'Pentru 312 lucrători, treapta potrivită e de 500 pe Start sau de 500 pe Profesional.'
    );
    expect(screen.getByTestId('payment-card').textContent).toContain('Nu ai salvat un card');
    expect(screen.getByTestId('invoices-card').textContent).toContain(
      'Prima factură apare aici după prima plată.'
    );
  });

  it('shows a specialist the plan and the usage, without amounts, card or invoices', async () => {
    mockApi({
      role: 'specialist',
      overview: overviewWith({
        subscription: activeSubscription(),
        employees: 1740,
        members: 10,
        limits: { employees: 1500, members: 10, sms: 300 },
      }),
    });
    mount();

    const card = await screen.findByTestId('plan-card');
    expect(within(card).getByRole('heading', { name: 'Profesional' })).toBeTruthy();
    expect(within(card).queryByTestId('plan-amount')).toBeNull();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(screen.getByTestId('member-note').textContent).toContain(
      'Adminul organizației se ocupă de abonament.'
    );
    expect(screen.getByTestId('price-list').textContent).toContain(
      'de la 39 € pe lună, pentru 250 de lucrători'
    );
    expect(screen.getByTestId('meter-employees').textContent).toContain('1.740 din 1.500');
    expect(screen.getByTestId('meter-employees').textContent).toContain('Cu 240 peste treaptă.');
    expect(screen.getByTestId('meter-members').textContent).toContain(
      'Profesional are 10 utilizatori. Pentru mai mulți, scrie-ne pentru o ofertă.'
    );
    expect(screen.queryByTestId('payment-card')).toBeNull();
    expect(screen.queryByTestId('invoices-card')).toBeNull();
  });

  it('says a plan chosen in the trial before 2026-11-14 costs nothing today, and lets the owner drop it', async () => {
    const subscription = trialChosenSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        limits: { employees: 5000, members: 10, sms: null },
        owner: ownerPart({
          card: { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 },
          nextPayment: {
            at: subscription.trialEndsAt!,
            subtotalCents: 5900,
            vatCents: 1239,
            totalCents: 7139,
          },
        }),
      }),
      routes: {
        'POST /billing/subscription/cancel': () => new Response(null, { status: 204 }),
      },
    });
    mount();

    expect((await screen.findByTestId('subscription-notice')).textContent).toContain(
      'Ai ales Start. Azi nu ai plătit nimic.'
    );
    const card = screen.getByTestId('plan-card');
    expect(within(card).getByTestId('plan-amount').textContent).toContain('71,39 €');
    expect(card.textContent).toContain('Start, până la 500 de lucrători, lunar');
    expect(screen.getByTestId('meter-employees').textContent).toContain('312 din 5.000');
    expect(screen.getByTestId('meter-members').textContent).toContain('1 din 10');
    expect(screen.getByTestId('meter-sms').textContent).toContain(
      'În perioada de probă nu trimitem SMS'
    );
    expect(screen.getByTestId('payment-card-number').textContent).toBe('Visa •••• 4242');

    const user = userEvent.setup();
    await user.click(within(card).getByTestId('subscription-cancel'));
    const dialog = await screen.findByTestId('cancel-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Renunți la planul ales?');
    await user.selectOptions(within(dialog).getByTestId('cancel-reason'), 'too_expensive');
    await user.type(within(dialog).getByTestId('cancel-note'), 'Revin în ianuarie.');
    await user.click(within(dialog).getByTestId('cancel-confirm'));

    await waitFor(() => expect(requests('/billing/subscription/cancel', 'POST')).toHaveLength(1));
    expect(bodyOf('/billing/subscription/cancel', 'POST')).toEqual({
      reason: 'too_expensive',
      note: 'Revin în ianuarie.',
    });
    expect(
      await screen.findByText('Ai renunțat la plan. Perioada de probă continuă.')
    ).toBeTruthy();
  });

  it('says when a plan chosen in the trial before 2026-11-14 has no confirmed card, and leads to the card form', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialChosenSubscription(), owner: ownerPart() }),
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain('Cardul nu a fost confirmat.');
    expect(notice.textContent).not.toContain('Cardul e salvat');
    expect(within(notice).getByRole('link', { name: 'Adaugă cardul' }).getAttribute('href')).toBe(
      '/organizatie/abonament/alege'
    );
  });

  it('shows an annual Profesional with its step, renewal and invoices, and no SMS extras', async () => {
    const subscription = activeSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        employees: 1400,
        members: 4,
        limits: { employees: 1500, members: 10, sms: 300 },
        owner: ownerPart({
          card: { brand: 'mastercard', last4: '8817', expMonth: 11, expYear: 2027 },
          smsOverageCents: 0,
          nextPayment: { at: inDays(6), subtotalCents: 0, vatCents: 0, totalCents: 0 },
          choices: {
            start: {
              minimumStep: null,
              problems: [{ reason: 'employees_over_plan', maximum: 750 }],
            },
            profesional: { minimumStep: 1500, problems: [] },
          },
          invoices: [
            {
              stripeInvoiceId: 'in_1',
              kind: 'invoice',
              number: 'SSMUSOR-0011',
              issuedAt: '2026-03-03T10:00:00.000Z',
              amountCents: 246840,
              currency: 'eur',
              stornoOf: null,
              hasPdf: true,
            },
            {
              stripeInvoiceId: 'in_2',
              kind: 'invoice',
              number: null,
              issuedAt: null,
              amountCents: 315,
              currency: 'eur',
              stornoOf: null,
              hasPdf: false,
            },
          ],
        }),
      }),
    });
    mount();

    const card = await screen.findByTestId('plan-card');
    expect(within(card).getByTestId('plan-amount').textContent).toContain('1.800,48 €');
    expect(card.textContent).toContain('Profesional, până la 1.500 de lucrători, anual1.488 €');
    expect(card.textContent).toContain('Total pe an1.800,48 €');
    expect(within(card).queryByTestId('plan-note')).toBeNull();
    expect(card.textContent).not.toContain('SMS-urile peste plan');
    expect(card.textContent).toContain(
      'Start nu este disponibil: acoperă cel mult 750 de lucrători, iar tu ai 1.400.'
    );
    expect(within(card).getByRole('link', { name: 'Schimbă planul sau treapta' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Treci la plata lunară' })).toBeTruthy();

    const rows = within(screen.getByTestId('invoices-card')).getAllByTestId('invoice-row');
    expect(rows[0]!.textContent).toContain('SSMUSOR-0011');
    expect(rows[0]!.textContent).toContain('2.468,40 €');
    const [ready, pending] = within(screen.getByTestId('invoices-card')).getAllByTestId(
      'invoice-download'
    );
    expect((ready as HTMLButtonElement).disabled).toBe(false);
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(pending!.textContent).toBe('PDF în curând');
  });

  it("offers the plan's own next step when over the step, with its price plus VAT", async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({ interval: 'month', step: 500 }),
        employees: 600,
        limits: { employees: 500, members: 10, sms: 100 },
        owner: ownerPart(),
      }),
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain(
      'Treapta de 1.000 de lucrători costă 119 € + TVA pe lună.'
    );
    expect(
      within(notice).getByRole('link', { name: 'Treci pe treapta următoare' }).getAttribute('href')
    ).toBe('/organizatie/abonament/alege?plan=profesional&step=1000');
  });

  it('says until when new employees can be added while over the step, and when that has passed', async () => {
    const over = (blocked: boolean) => {
      const overview = overviewWith({
        subscription: activeSubscription({ interval: 'month', step: 500 }),
        employees: 600,
        limits: { employees: 500, members: 10, sms: 100 },
        owner: ownerPart(),
      });
      overview.usage.employeesOverStep = {
        since: '2026-11-02T10:00:00.000Z',
        lastDay: '2026-12-02',
        blocked,
      };
      return overview;
    };
    mockApi({ overview: over(false) });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain('Poți adăuga lucrători noi până pe 02.12.2026 inclusiv.');
    expect(notice.textContent).toContain(
      'nu mai poți adăuga lucrători noi până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi'
    );
    cleanup();

    mockApi({ overview: over(true) });
    mount();
    const blocked = await screen.findByTestId('subscription-notice');
    expect(blocked.textContent).toContain('Nu mai poți adăuga lucrători noi.');
    expect(blocked.textContent).toContain('De mai bine de o lună ai 600 de lucrători');
  });

  it('counts the open invitations among the users, and offers Profesional once Start is full', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({ plan: 'start', interval: 'month', step: 500 }),
        members: 2,
        invitations: 1,
        limits: { employees: 500, members: 3, sms: 100 },
        owner: ownerPart(),
      }),
    });
    mount();

    const meter = await screen.findByTestId('meter-members');
    expect(meter.textContent).toContain('2 din 3');
    expect(within(meter).getByTestId('meter-members-hint').textContent).toBe(
      'O invitație în așteptare ține un loc. Start are 3 utilizatori. Pentru un coleg nou, treci pe Profesional, care are 10.'
    );
    expect(within(meter).getByRole('link', { name: 'Treci pe Profesional' })).toBeTruthy();
  });

  it('opens an invoice PDF through a signed link', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal(
      'open',
      vi.fn(() => tab)
    );
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription(),
        owner: ownerPart({
          invoices: [
            {
              stripeInvoiceId: 'in_1',
              kind: 'invoice',
              number: 'SSMUSOR-0011',
              issuedAt: '2026-03-03T10:00:00.000Z',
              amountCents: 246840,
              currency: 'eur',
              stornoOf: null,
              hasPdf: true,
            },
          ],
        }),
      }),
      routes: {
        'GET /billing/invoices/in_1/pdf': () =>
          Response.json({
            url: 'https://storage.example.test/SSMUSOR-0011.pdf?token=t',
            fileName: 'SSMUSOR-0011.pdf',
            expiresAt: inDays(1),
          }),
      },
    });
    mount();

    const [download] = await screen.findAllByTestId('invoice-download');
    await userEvent.click(download!);
    await waitFor(() =>
      expect(tab.location.href).toBe('https://storage.example.test/SSMUSOR-0011.pdf?token=t')
    );
    expect(tab.opener).toBeNull();
  });

  it('confirms a move to monthly billing from the preview, then applies it', async () => {
    const subscription = activeSubscription();
    const target = { plan: 'profesional', step: 1500, interval: 'month' } as const;
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': () =>
          Response.json(previewFor(target, { appliesAt: subscription.currentPeriodEnd! })),
        'PATCH /billing/subscription': () => Response.json({ clientSecret: null, intent: null }),
      },
    });
    mount();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('subscription-switch-interval'));
    const dialog = await screen.findByTestId('change-dialog');
    const when = roDate(subscription.currentPeriodEnd!);
    expect(
      (await within(dialog).findByRole('heading', { name: `Treci la plata lunară de pe ${when}?` }))
        .textContent
    ).toBeTruthy();
    expect(dialog.textContent).toContain('180,29 €');
    const previewsBefore = requests('/billing/preview', 'POST').length;
    await user.click(within(dialog).getByTestId('change-confirm'));

    await waitFor(() => expect(requests('/billing/subscription', 'PATCH')).toHaveLength(1));
    expect(bodyOf('/billing/subscription', 'PATCH')).toEqual(target);
    expect(
      await screen.findByText(/De pe .* treci la Profesional, până la 1\.500 de lucrători, lunar/)
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('change-dialog')).toBeNull());

    await user.click(screen.getByTestId('subscription-switch-interval'));
    await waitFor(() =>
      expect(requests('/billing/preview', 'POST').length).toBeGreaterThan(previewsBefore)
    );
  });

  it('shows what a change charges before the renewal, and sends the moment it was priced at', async () => {
    const subscription = activeSubscription({ interval: 'month' });
    const shownAt = new Date(Date.now() - 60_000).toISOString();
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              appliesAt: subscription.currentPeriodEnd!,
              proration: { subtotalCents: 2250, chargedNow: false },
              prorationDate: shownAt,
            })
          ),
        'PATCH /billing/subscription': () => Response.json({ clientSecret: null, intent: null }),
      },
    });
    mount();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('subscription-switch-interval'));
    const dialog = await screen.findByTestId('change-dialog');
    await within(dialog).findByRole('heading', { name: 'Treci la plata anuală?' });
    await user.click(within(dialog).getByTestId('change-confirm'));

    await waitFor(() => expect(requests('/billing/subscription', 'PATCH')).toHaveLength(1));
    expect(bodyOf('/billing/subscription', 'PATCH')).toMatchObject({ prorationDate: shownAt });
  });

  it('refuses a change for the renewal while an annual payment is still confirming, and says why', async () => {
    const subscription = activeSubscription();
    mockApi({
      overview: overviewWith({ subscription, owner: ownerPart() }),
      routes: {
        'POST /billing/preview': (init) =>
          Response.json(
            previewFor(JSON.parse(String(init?.body)) as BillingChoice, {
              problems: [{ reason: 'split_change' }],
            })
          ),
      },
    });
    mount();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('subscription-switch-interval'));
    const dialog = await screen.findByTestId('change-dialog');
    expect(await within(dialog).findByText(/încă se confirmă/)).toBeTruthy();
    expect((within(dialog).getByTestId('change-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for a new card after a failed payment, through the card portal', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          status: 'past_due',
          interval: 'month',
          accessUntil: inDays(14),
        }),
        owner: ownerPart({ card: { brand: 'visa', last4: '0341', expMonth: 10, expYear: 2026 } }),
      }),
      routes: {
        'POST /billing/portal-session': () =>
          Response.json({ url: 'https://billing.stripe.com/p/session/test' }),
      },
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain('Banca a refuzat cardul Visa •••• 0341.');
    expect(screen.getByTestId('payment-card').textContent).toContain('Refuzat');
    await userEvent.click(within(notice).getByTestId('notice-card'));
    await waitFor(() =>
      expect(leaveFor).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test')
    );
  });

  it('reactivates a cancelled plan before it ends', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          plan: 'start',
          interval: 'month',
          step: 500,
          accessUntil: inDays(15),
          cancelsAt: inDays(15),
        }),
        owner: ownerPart(),
      }),
      routes: { 'POST /billing/subscription/resume': () => new Response(null, { status: 204 }) },
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain(`Abonamentul se încheie pe ${roDate(inDays(15))}.`);
    expect(
      within(screen.getByTestId('plan-card')).getByTestId('plan-amount').textContent
    ).toContain('Niciuna');
    await userEvent.click(within(notice).getByTestId('notice-resume'));
    await waitFor(() => expect(requests('/billing/subscription/resume', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Abonamentul se reînnoiește din nou.')).toBeTruthy();
  });

  it('dates a cancellation while a payment is overdue by the end of the retries', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          status: 'past_due',
          interval: 'month',
          accessUntil: inDays(9),
          currentPeriodEnd: inDays(30),
        }),
        owner: ownerPart(),
      }),
    });
    mount();

    await userEvent.click(
      within(await screen.findByTestId('plan-card')).getByTestId('subscription-cancel')
    );
    const timeline = await screen.findByTestId('cancel-timeline');
    expect(timeline.textContent).toContain(`Până pe ${roDate(inDays(9))}`);
    expect(timeline.textContent).not.toContain(roDate(inDays(30)));
  });

  it('shows a plan cancelled while a payment is overdue as cancelled, with the way back', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          status: 'past_due',
          interval: 'month',
          accessUntil: inDays(9),
          cancelsAt: inDays(9),
        }),
        owner: ownerPart(),
      }),
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain(
      `Abonamentul e anulat și se încheie pe ${roDate(inDays(9))}.`
    );
    expect(within(notice).getByTestId('notice-resume')).toBeTruthy();
    expect(within(screen.getByTestId('plan-card')).getByTestId('subscription-resume')).toBeTruthy();
  });

  it('shows an annual renewal at the choice a change set for it', async () => {
    const subscription = activeSubscription({ plan: 'profesional', interval: 'year' });
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart({
          scheduledChange: {
            plan: 'start',
            step: 500,
            interval: 'year',
            at: subscription.currentPeriodEnd!,
          },
        }),
      }),
    });
    mount();

    expect((await screen.findByTestId('plan-amount')).textContent).toContain('711,48 €');
  });

  it('says cancelling drops a change set for the renewal', async () => {
    const subscription = activeSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart({
          scheduledChange: {
            plan: 'start',
            step: 500,
            interval: 'year',
            at: subscription.currentPeriodEnd!,
          },
        }),
      }),
    });
    mount();

    await userEvent.click(
      within(await screen.findByTestId('plan-card')).getByTestId('subscription-cancel')
    );
    expect((await screen.findByTestId('cancel-drops-scheduled')).textContent).toContain(
      `Schimbarea programată pentru ${roDate(subscription.currentPeriodEnd!)}`
    );
  });

  it('keeps the tab working while read-only, with the way back', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          plan: 'start',
          status: 'canceled',
          interval: 'month',
          step: 500,
          accessUntil: inDays(-7),
          access: 'read_only',
          deletesAt: inDays(23),
        }),
        owner: ownerPart(),
      }),
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain(
      `Contul e doar pentru citire până pe ${roDate(inDays(23))}.`
    );
    expect(
      within(notice).getByRole('link', { name: 'Reactivează abonamentul' }).getAttribute('href')
    ).toBe('/organizatie/abonament/alege');
    expect(
      within(screen.getByTestId('plan-card')).getByTestId('plan-amount').textContent
    ).toContain(roDate(inDays(23)));
    expect(screen.getByTestId('meter-sms').textContent).toContain('nu se mai trimit SMS-uri');
  });

  it('shows support acting as the owner the page with every action off', async () => {
    mockApi({
      impersonating: true,
      overview: overviewWith({ subscription: activeSubscription(), owner: null }),
    });
    mount();

    const card = await screen.findByTestId('plan-card');
    expect(screen.getByText(/Doar el îl poate schimba/)).toBeTruthy();
    const buttons = within(card).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('member-note')).toBeNull();
  });

  it('saves the email for invoices, and clears it back to the owner', async () => {
    mockApi({
      overview: overviewWith({ subscription: activeSubscription(), owner: ownerPart() }),
      routes: {
        'PUT /billing/invoice-email': (init) => Response.json(JSON.parse(String(init?.body))),
      },
    });
    mount();

    const user = userEvent.setup();
    const input = await screen.findByTestId('invoice-email');
    await user.type(input, 'nu-e-email');
    await user.click(screen.getByTestId('invoice-email-save'));
    expect(await screen.findByText(/Scrie o adresă de email validă/)).toBeTruthy();
    expect(requests('/billing/invoice-email', 'PUT')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, 'contabilitate@protectconsult.ro');
    await user.click(screen.getByTestId('invoice-email-save'));
    await waitFor(() => expect(requests('/billing/invoice-email', 'PUT')).toHaveLength(1));
    expect(bodyOf('/billing/invoice-email', 'PUT')).toEqual({
      email: 'contabilitate@protectconsult.ro',
    });
  });
});

describe('the signing codes by SMS on the Abonament tab', () => {
  const monthly = () => activeSubscription({ interval: 'month' });
  const paidWith = (sms: Parameters<typeof smsUsage>[0], owner: Owner | null = ownerPart()) =>
    overviewWith({ subscription: monthly(), owner, sms: smsUsage(sms) });

  it('stops the codes at the allowance, sends them by email, and bills nothing', async () => {
    const sms = { used: 300, state: 'stopped' as const };
    mockApi({ overview: paidWith(sms) });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(meter.textContent).toContain('300 din 300');
    const hint = within(meter).getByTestId('meter-sms-hint').textContent;
    expect(hint).toMatch(/^Ai folosit cele 300 ale lunii\. Până pe .*, codurile pleacă pe email/);
    expect(hint).not.toContain('€');
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain(
      'bg-destructive'
    );
    expect(screen.queryByText('Ridică limita')).toBeNull();
  });

  it('turns amber from 80 %', async () => {
    mockApi({ overview: paidWith({ used: 252, state: 'near' }) });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain(
      'bg-warning-border'
    );
    expect(within(meter).getByTestId('meter-sms-hint').className).toContain(
      'text-warning-foreground'
    );
  });

  it('shows a trial without SMS', async () => {
    mockApi({ overview: overviewWith({ subscription: trialSubscription(), owner: ownerPart() }) });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(within(meter).queryByRole('meter')).toBeNull();
    expect(meter.textContent).toContain('În perioada de probă nu trimitem SMS');
  });
});

describe('the AI credits on the Abonament tab', () => {
  const monthly = () => activeSubscription({ interval: 'month' });

  it("shows the month's credits, the welcome gift left and what a credit is", async () => {
    mockApi({
      overview: overviewWith({
        subscription: monthly(),
        owner: ownerPart(),
        credits: creditsUsage(),
      }),
    });
    mount();
    const meter = await screen.findByTestId('meter-credits');
    expect(meter.textContent).toContain('Credite AI');
    expect(meter.textContent).toContain('640 din 3.250');
    const gift = screen.getByTestId('credits-gift');
    expect(gift.dataset.look).toBe('balance');
    expect(gift.textContent).toContain('8.640');
    expect(gift.textContent).toContain('Rămase din cele primite la prima plată. Nu expiră');
    expect(screen.getByTestId('usage-card').textContent).toContain(
      'Cu creditele AI, inteligența artificială citește documentele și fișele pe care le încarci.'
    );
  });

  it('shows a balance below zero short beside the label, with the sentence in the hint', async () => {
    mockApi({
      overview: overviewWith({
        subscription: monthly(),
        owner: ownerPart(),
        credits: creditsUsage({ used: 3254, left: -4, giftLeft: 0, state: 'negative' }),
      }),
    });
    mount();
    const meter = await screen.findByTestId('meter-credits');
    expect(within(meter).getByText('−4').className).toContain('sm:hidden');
    expect(within(meter).getByText('−4 · se scad din luna viitoare').className).toContain(
      'hidden sm:inline'
    );
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain('bg-chart-3');
    expect(screen.getByTestId('credits-gift').dataset.look).toBe('spent');
  });

  it('turns red when used up, and promises no welcome credits during the trial', async () => {
    mockApi({
      overview: overviewWith({
        subscription: monthly(),
        owner: ownerPart(),
        credits: creditsUsage({ used: 3250, left: 0, giftLeft: 0, state: 'out' }),
      }),
    });
    mount();
    const meter = await screen.findByTestId('meter-credits');
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain(
      'bg-destructive'
    );
    expect(within(meter).getByTestId('meter-credits-hint').textContent).toMatch(
      /^Nu poți porni un import nou până pe .*, când primești alte 3\.250\.$/
    );
    cleanup();
    disposeRuntimes();

    mockApi({
      overview: overviewWith({
        subscription: trialSubscription(),
        owner: ownerPart(),
        credits: { used: 85, left: 215 },
      }),
    });
    mount();
    expect((await screen.findByTestId('meter-credits-hint')).textContent).toMatch(
      /^Pentru toată perioada de probă, până pe .*\. Nu se reînnoiesc\.$/
    );
    expect(screen.queryByTestId('credits-gift')).toBeNull();
  });
});
