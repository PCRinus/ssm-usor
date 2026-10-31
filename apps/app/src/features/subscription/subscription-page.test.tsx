import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  activeSubscription,
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
}: {
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
        meFor({ role, impersonating, subscription: summaryOf(overview.subscription) })
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

const mount = () => mountApp(authFixture(makeSession()).client, '/organization/subscription');

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
      '/organization/subscription/choose'
    );
    expect(screen.getByTestId('meter-sms').textContent).toContain(
      'SMS-urile pornesc când alegi un plan'
    );
    expect(screen.getByTestId('meter-employees').textContent).toContain(
      'pentru 312 îți trebuie 2 pachete de câte 50 de angajați'
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
        members: 4,
        limits: { employees: 2000, members: 4, sms: 300 },
      }),
    });
    mount();

    const card = await screen.findByTestId('plan-card');
    expect(within(card).getByRole('heading', { name: 'Profesional' })).toBeTruthy();
    expect(within(card).queryByTestId('plan-amount')).toBeNull();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(screen.getByTestId('member-note').textContent).toContain(
      'Administratorul organizației se ocupă de abonament.'
    );
    expect(screen.getByTestId('price-list').textContent).toContain('39 € pe lună sau 390 € pe an');
    expect(screen.getByTestId('meter-employees').textContent).toContain('1.740 din 2.000');
    expect(screen.getByTestId('meter-members').textContent).toContain(
      'administratorul adaugă un utilizator'
    );
    expect(screen.queryByTestId('payment-card')).toBeNull();
    expect(screen.queryByTestId('invoices-card')).toBeNull();
  });

  it('says a plan chosen in the trial costs nothing today, and lets the owner drop it', async () => {
    const subscription = trialChosenSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        limits: { employees: 1500, members: 3, sms: 50 },
        owner: ownerPart({
          card: { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 },
          nextPayment: {
            at: subscription.trialEndsAt!,
            subtotalCents: 6900,
            vatCents: 1449,
            totalCents: 8349,
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
    expect(within(card).getByTestId('plan-amount').textContent).toContain('83,49 €');
    expect(card.textContent).toContain('2 pachete de câte 50 de angajați');
    expect(screen.getByTestId('meter-employees').textContent).toContain('312 din 350');
    expect(screen.getByTestId('meter-sms').textContent).toContain('0 din 50');
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

  it('says when a plan chosen in the trial has no confirmed card, and leads to the card form', async () => {
    mockApi({
      overview: overviewWith({ subscription: trialChosenSubscription(), owner: ownerPart() }),
    });
    mount();

    const notice = await screen.findByTestId('subscription-notice');
    expect(notice.textContent).toContain('Cardul nu a fost confirmat.');
    expect(notice.textContent).not.toContain('Cardul e salvat');
    expect(within(notice).getByRole('link', { name: 'Adaugă cardul' }).getAttribute('href')).toBe(
      '/organization/subscription/choose'
    );
  });

  it('shows an annual Profesional with its renewal, extra SMS and invoices', async () => {
    const subscription = activeSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        employees: 1740,
        members: 4,
        limits: { employees: 2000, members: 4, sms: 300 },
        owner: ownerPart({
          card: { brand: 'mastercard', last4: '8817', expMonth: 11, expYear: 2027 },
          smsOverageCents: 260,
          nextPayment: { at: inDays(6), subtotalCents: 260, vatCents: 55, totalCents: 315 },
          choices: {
            start: {
              minimums: { employeePacks: 30, extraMembers: 1 },
              problems: [{ reason: 'start_employee_ceiling' }],
            },
            profesional: { minimums: { employeePacks: 1, extraMembers: 1 }, problems: [] },
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
    expect(within(card).getByTestId('plan-amount').textContent).toContain('2.468,40 €');
    expect(card.textContent).toContain('Total pe an2.468,40 €');
    expect(within(card).getByTestId('plan-note').textContent).toContain('2,60 € + TVA');
    expect(card.textContent).toContain(
      'Start nu este disponibil: acoperă cel mult 600 de angajați, iar tu ai 1.740.'
    );
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
    const target = {
      plan: 'profesional',
      interval: 'month',
      employeePacks: 1,
      extraMembers: 1,
    } as const;
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
    expect(dialog.textContent).toContain('246,84 €');
    const previewsBefore = requests('/billing/preview', 'POST').length;
    await user.click(within(dialog).getByTestId('change-confirm'));

    await waitFor(() => expect(requests('/billing/subscription', 'PATCH')).toHaveLength(1));
    expect(bodyOf('/billing/subscription', 'PATCH')).toEqual(target);
    expect(await screen.findByText(/De pe .* treci la Profesional, lunar/)).toBeTruthy();
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

  it('refuses an annual change that adds now and removes at the renewal, and says why', async () => {
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
    expect(await within(dialog).findByText(/le faci pe rând/)).toBeTruthy();
    expect((within(dialog).getByTestId('change-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for a new card after a failed payment, through the card portal', async () => {
    mockApi({
      overview: overviewWith({
        subscription: activeSubscription({
          status: 'past_due',
          interval: 'month',
          employeePacks: 0,
          extraMembers: 0,
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
          employeePacks: 2,
          extraMembers: 0,
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
    const subscription = activeSubscription({
      plan: 'profesional',
      interval: 'year',
      employeePacks: 0,
      extraMembers: 1,
    });
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart({
          scheduledChange: {
            plan: 'start',
            interval: 'year',
            employeePacks: 0,
            extraMembers: 1,
            at: subscription.currentPeriodEnd!,
          },
        }),
      }),
    });
    mount();

    expect((await screen.findByTestId('plan-amount')).textContent).toContain('653,40 €');
  });

  it('says cancelling drops a change set for the renewal', async () => {
    const subscription = activeSubscription();
    mockApi({
      overview: overviewWith({
        subscription,
        owner: ownerPart({
          scheduledChange: {
            plan: 'start',
            interval: 'year',
            employeePacks: 1,
            extraMembers: 0,
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
          employeePacks: 2,
          extraMembers: 0,
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
    ).toBe('/organization/subscription/choose');
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
  const monthly = () =>
    activeSubscription({ interval: 'month', employeePacks: 0, extraMembers: 0 });
  const paidWith = (sms: Parameters<typeof smsUsage>[0], owner: Owner | null = ownerPart()) =>
    overviewWith({ subscription: monthly(), owner, sms: smsUsage(sms) });

  it('shows the owner the codes past the allowance and their price, and a member no amounts', async () => {
    const sms = { used: 342, overage: 42, state: 'over' as const };
    mockApi({ overview: paidWith(sms) });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(meter.textContent).toContain('342 din 300');
    expect(within(meter).getByTestId('meter-sms-hint').textContent).toContain(
      '+42 peste cele incluse, 0,10\u00a0€ fiecare, pe factura din'
    );
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain('bg-chart-3');
    cleanup();
    disposeRuntimes();

    mockApi({ overview: paidWith(sms, null), role: 'specialist' });
    mount();
    const forMember = await screen.findByTestId('meter-sms-hint');
    expect(forMember.textContent).toBe(
      '+42 peste cele incluse. Codurile se trimit mai departe, până la 900 de coduri pe lună.'
    );
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

  it('lets the owner raise the cap once it is reached, and says what the new one means', async () => {
    let factor = 3;
    mockApi({
      overview: paidWith({ used: 900, overage: 600, state: 'capped' }),
      routes: {
        'PUT /billing/sms-cap': (init) => {
          factor = (JSON.parse(String(init?.body)) as { factor: number }).factor;
          return Response.json({ factor, cap: factor * 300 });
        },
      },
    });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(within(meter).getByRole('meter').firstElementChild!.className).toContain(
      'bg-destructive'
    );
    expect(within(meter).getByTestId('meter-sms-hint').textContent).toContain(
      'Cele 600 peste plan: 60 € + TVA'
    );

    const user = userEvent.setup();
    await user.click(within(meter).getByTestId('meter-sms-raise'));
    const dialog = await screen.findByTestId('sms-cap-dialog');
    expect(dialog.textContent).toContain(
      'Acum e de 900 de coduri pe lună, de 3 ori cele 300 ale planului.'
    );
    expect(within(dialog).getByTestId<HTMLSelectElement>('sms-cap-factor').value).toBe('4');
    expect(within(dialog).getByTestId('sms-cap-summary').textContent).toContain(
      'Până la 1.200 de coduri pe lună.'
    );
    expect(within(dialog).getByTestId('sms-cap-summary').textContent).toContain(
      'cel mult 90 € + TVA pe lună'
    );

    await user.selectOptions(within(dialog).getByTestId('sms-cap-factor'), '5');
    expect(within(dialog).getByTestId('sms-cap-summary').textContent).toContain(
      'Până la 1.500 de coduri pe lună.'
    );
    await user.click(within(dialog).getByTestId('sms-cap-save'));
    await waitFor(() => expect(factor).toBe(5));
    expect(await screen.findByText('Limita e acum de 1.500 de coduri pe lună.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('sms-cap-dialog')).toBeNull());
  });

  it('opens the dialog from the bar, and says why a change was refused', async () => {
    mockApi({
      overview: paidWith({ used: 900, overage: 600, state: 'capped' }),
      routes: {
        'PUT /billing/sms-cap': () =>
          Response.json(
            { error: 'conflict', message: 'enterprise', reason: 'enterprise_plan' },
            { status: 409 }
          ),
      },
    });
    mountApp(authFixture(makeSession()).client, '/organization/subscription?raiseCap=true');
    const dialog = await screen.findByTestId('sms-cap-dialog');
    await userEvent.click(within(dialog).getByTestId('sms-cap-save'));
    expect((await within(dialog).findByTestId('sms-cap-error')).textContent).toContain(
      'Abonamentul Enterprise se schimbă prin email'
    );
  });

  it('offers a member no way to raise the cap', async () => {
    mockApi({
      overview: paidWith({ used: 900, overage: 600, state: 'capped' }, null),
      role: 'specialist',
    });
    mountApp(authFixture(makeSession()).client, '/organization/subscription?raiseCap=true');
    expect((await screen.findByTestId('meter-sms-hint')).textContent).toContain(
      'Administratorul poate ridica limita.'
    );
    expect(screen.queryByTestId('meter-sms-raise')).toBeNull();
    expect(screen.queryByTestId('sms-cap-dialog')).toBeNull();
  });

  it('shows the hard stop of a plan chosen during the trial, and a trial without SMS', async () => {
    mockApi({
      overview: overviewWith({
        subscription: trialChosenSubscription(),
        owner: ownerPart(),
        sms: smsUsage({
          used: 50,
          included: 50,
          allowance: 50,
          cap: null,
          capFactor: null,
          state: 'stopped',
        }),
      }),
    });
    mount();
    const hint = await screen.findByTestId('meter-sms-hint');
    expect(hint.textContent).toMatch(/^Ai folosit cele 50 de până la prima plată\./);
    expect(hint.className).toContain('text-destructive-foreground');
    expect(screen.queryByTestId('meter-sms-raise')).toBeNull();
    cleanup();
    disposeRuntimes();

    mockApi({ overview: overviewWith({ subscription: trialSubscription(), owner: ownerPart() }) });
    mount();
    const meter = await screen.findByTestId('meter-sms');
    expect(within(meter).queryByRole('meter')).toBeNull();
    expect(meter.textContent).toContain('În perioada de probă nu trimitem SMS');
  });
});
