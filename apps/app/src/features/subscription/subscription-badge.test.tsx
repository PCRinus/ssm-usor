import type { SubscriptionSummary } from '@ssm-usor/contracts';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { creditsUsage, smsUsage } from '@/test/billing-fixture';

import { SubscriptionBadge } from './subscription-badge';
import { SubscriptionBar } from './subscription-bar';

const inDays = (days: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
};

const trial = (days: number): SubscriptionSummary => ({
  plan: 'profesional',
  planChosen: false,
  status: 'trialing',
  trialEndsAt: inDays(days),
  accessUntil: inDays(days),
  access: 'full',
  deletesAt: null,
});

const chosen = (days: number): SubscriptionSummary => ({
  ...trial(days),
  plan: 'start',
  planChosen: true,
  accessUntil: inDays(days + 14),
});

const readOnly: SubscriptionSummary = {
  ...trial(-2),
  access: 'read_only',
  deletesAt: inDays(28),
};

const active: SubscriptionSummary = {
  plan: 'profesional',
  planChosen: true,
  status: 'active',
  trialEndsAt: null,
  accessUntil: null,
  access: 'full',
  deletesAt: null,
};

const pastDue: SubscriptionSummary = {
  plan: 'profesional',
  planChosen: true,
  status: 'past_due',
  trialEndsAt: null,
  accessUntil: inDays(10),
  access: 'full',
  deletesAt: null,
};

// The badge and the bar link to the Abonament tab, so they render inside a router.
async function renderRouted(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  });
  const result = render(<RouterProvider router={router} />);
  await router.load();
  return result;
}

afterEach(() => localStorage.clear());

describe('SubscriptionBadge', () => {
  it('opens the trial details, with the way to choose a plan for the owner', async () => {
    await renderRouted(
      <SubscriptionBadge subscription={trial(20)} sms={null} isOwner impersonating={false} />
    );

    expect((await screen.findByTestId('subscription-badge')).textContent).toBe(
      'Probă · 20 de zile'
    );
    await userEvent.click(screen.getByTestId('subscription-badge'));

    const details = await screen.findByTestId('subscription-details');
    expect(details.textContent).toContain('Mai ai 20 de zile');
    expect(screen.getByRole('link', { name: 'Alege un plan' }).getAttribute('href')).toBe(
      '/organization/subscription'
    );
    expect(screen.getByRole('link', { name: 'Vezi prețurile' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Scrie-ne ca să continui' })).toBeNull();
  });

  it('names the plan chosen during a trial, with the day of the first payment', async () => {
    await renderRouted(
      <SubscriptionBadge subscription={chosen(12)} sms={null} isOwner impersonating={false} />
    );

    const badge = await screen.findByTestId('subscription-badge');
    expect(badge.textContent).toBe('Start');
    expect(badge.dataset.seal).toBe('start');
    await userEvent.click(badge);

    const details = await screen.findByTestId('subscription-details');
    expect(details.textContent).toContain('Ai ales Start');
    expect(details.textContent).toMatch(/Proba continuă până pe \d\d\.\d\d\.\d{4}\. Prima plată/);
    expect(screen.getByRole('link', { name: 'Gestionează abonamentul' })).toBeTruthy();
  });

  it('tells a specialist who decides, and support acting as the owner nothing to do', async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBadge subscription={readOnly} sms={null} isOwner={false} impersonating={false} />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details')).textContent).toContain(
      'Administratorul organizației se ocupă de abonament.'
    );
    expect(screen.getByRole('link', { name: 'Vezi abonamentul' })).toBeTruthy();
    unmount();

    await renderRouted(
      <SubscriptionBadge subscription={readOnly} sms={null} isOwner impersonating />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    const details = await screen.findByTestId('subscription-details');
    expect(details.textContent).not.toContain('Administratorul organizației');
    expect(screen.queryByRole('link', { name: 'Alege un plan' })).toBeNull();
  });
});

describe('SubscriptionBar', () => {
  it('stays hidden earlier in a trial, and once a plan is chosen', async () => {
    const { container, unmount } = await renderRouted(
      <SubscriptionBar subscription={trial(20)} sms={null} isOwner canAct />
    );
    expect(container.innerHTML).toBe('');
    unmount();

    const chosenBar = await renderRouted(
      <SubscriptionBar subscription={chosen(3)} sms={null} isOwner canAct />
    );
    expect(chosenBar.container.innerHTML).toBe('');
  });

  it('closes until tomorrow in the last week of a trial, and leads the owner to a plan', async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBar subscription={trial(5)} sms={null} isOwner canAct />
    );
    expect((await screen.findByTestId('subscription-bar-action')).getAttribute('href')).toBe(
      '/organization/subscription'
    );
    expect(screen.getByTestId('subscription-bar-action').textContent).toBe('Alege un plan');
    await userEvent.click(screen.getByTestId('subscription-bar-close'));
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
    unmount();

    await renderRouted(<SubscriptionBar subscription={trial(5)} sms={null} isOwner canAct />);
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
  });

  it('cannot be closed on the last day, nor while read-only', async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBar subscription={trial(1)} sms={null} isOwner canAct />
    );
    expect((await screen.findByTestId('subscription-bar')).textContent).toContain(
      'se încheie mâine'
    );
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    unmount();

    await renderRouted(
      <SubscriptionBar subscription={readOnly} sms={null} isOwner canAct={false} />
    );
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('readOnly');
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    expect(screen.queryByTestId('subscription-bar-action')).toBeNull();
  });

  it('sends the owner to the tab to update the card after a failed payment', async () => {
    await renderRouted(<SubscriptionBar subscription={pastDue} sms={null} isOwner canAct />);
    const action = await screen.findByTestId('subscription-bar-action');
    expect(action.textContent).toBe('Actualizează cardul');
    expect(action.getAttribute('href')).toBe('/organization/subscription');
  });
});

describe('the SMS bar', () => {
  const near = smsUsage({ used: 252, state: 'near' });

  it('shows from 80 % to every member, and closes until tomorrow', async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBar subscription={active} sms={near} isOwner={false} canAct={false} />
    );
    const bar = await screen.findByTestId('subscription-bar');
    expect(bar.dataset.kind).toBe('sms');
    expect(bar.textContent).toContain('Ai folosit 252 din cele 300 de coduri de semnare prin SMS.');
    expect(bar.textContent).not.toContain('€');
    expect(screen.getByTestId('subscription-bar-action').getAttribute('href')).toBe(
      '/organization/subscription'
    );
    await userEvent.click(screen.getByTestId('subscription-bar-close'));
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
    unmount();

    const again = await renderRouted(
      <SubscriptionBar subscription={active} sms={near} isOwner={false} canAct={false} />
    );
    expect(again.container.innerHTML).toBe('');
    again.unmount();

    await renderRouted(
      <SubscriptionBar
        subscription={active}
        sms={smsUsage({ used: 342, state: 'over' })}
        isOwner
        canAct
      />
    );
    expect((await screen.findByTestId('subscription-bar')).dataset.state).toBe('over');
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
  });

  it('still shows when the browser keeps nothing', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderRouted(<SubscriptionBar subscription={active} sms={near} isOwner canAct />);
    await userEvent.click(await screen.findByTestId('subscription-bar-close'));
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('turns red at the cap, with the owner raising it from the bar', async () => {
    const capped = smsUsage({ used: 900, state: 'capped' });
    const { unmount } = await renderRouted(
      <SubscriptionBar subscription={active} sms={capped} isOwner canAct />
    );
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('smsStop');
    const action = screen.getByTestId('subscription-bar-action');
    expect(action.textContent).toBe('Ridică limita');
    expect(action.getAttribute('href')).toBe('/organization/subscription?raiseCap=true');
    unmount();

    await renderRouted(
      <SubscriptionBar subscription={active} sms={capped} isOwner={false} canAct={false} />
    );
    expect((await screen.findByTestId('subscription-bar')).textContent).toContain(
      'administratorul poate ridica limita'
    );
    expect(screen.queryByTestId('subscription-bar-action')).toBeNull();
  });

  it("gives way to the account's own bar, and stays out while read-only", async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBar
        subscription={pastDue}
        sms={smsUsage({ used: 900, state: 'capped' })}
        isOwner
        canAct
      />
    );
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('pastDue');
    unmount();

    await renderRouted(
      <SubscriptionBar
        subscription={{ ...active, access: 'read_only' }}
        sms={near}
        isOwner
        canAct
      />
    );
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('readOnly');
  });

  it('shows the SMS bar once the trial bar is closed for the day', async () => {
    const tester = smsUsage({ used: 252, cap: null, capFactor: null, state: 'near' });
    await renderRouted(<SubscriptionBar subscription={trial(5)} sms={tester} isOwner canAct />);
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('trial');
    await userEvent.click(screen.getByTestId('subscription-bar-close'));
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('sms');
  });
});

describe('the SMS meter in the badge', () => {
  it("shows the month's codes, and marks the badge when they stopped", async () => {
    await renderRouted(
      <SubscriptionBadge
        subscription={active}
        sms={smsUsage({ used: 900, state: 'capped' })}
        isOwner={false}
        impersonating={false}
      />
    );
    const badge = await screen.findByTestId('subscription-badge');
    expect(screen.getByTestId('subscription-badge-alert')).toBeTruthy();
    expect(badge.getAttribute('aria-label')).toContain('codurile SMS oprite');
    await userEvent.click(badge);
    const meter = await screen.findByTestId('subscription-details-sms');
    expect(meter.dataset.state).toBe('capped');
    expect(meter.textContent).toBe('Coduri de semnare prin SMS900 / 300');
  });

  it('says a trial sends none, and where a plan chosen in it stops', async () => {
    const { unmount } = await renderRouted(
      <SubscriptionBadge
        subscription={trial(12)}
        sms={smsUsage({ state: 'none', included: 0 })}
        isOwner
        impersonating={false}
      />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details-sms-note')).textContent).toBe(
      'În perioada de probă totul pleacă pe email; SMS-urile pornesc când alegi un plan.'
    );
    expect(screen.queryByTestId('subscription-details-sms')).toBeNull();
    expect(screen.queryByTestId('subscription-badge-alert')).toBeNull();
    unmount();

    await renderRouted(
      <SubscriptionBadge
        subscription={chosen(12)}
        sms={smsUsage({ used: 4, included: 50, allowance: 50, cap: null, capFactor: null })}
        isOwner
        impersonating={false}
      />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details-sms')).textContent).toContain('4 / 50');
    expect(screen.getByTestId('subscription-details-sms-note').textContent).toBe(
      'Până la prima plată, codurile se opresc la 50.'
    );
  });
});

describe('the credits meter in the badge', () => {
  it("shows the month's credits and the welcome gift left", async () => {
    await renderRouted(
      <SubscriptionBadge
        subscription={active}
        sms={smsUsage({ used: 142 })}
        credits={creditsUsage()}
        isOwner
        impersonating={false}
      />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details-credits')).textContent).toBe(
      'Credite pentru import640 / 1.500'
    );
    expect(screen.getByTestId('subscription-details-gift').textContent).toBe(
      'Plus 8.640 de credite de bun venit, fără termen.'
    );
  });

  it('promises the gift to a plan chosen during the trial', async () => {
    await renderRouted(
      <SubscriptionBadge
        subscription={chosen(12)}
        sms={null}
        credits={creditsUsage({
          used: 85,
          included: 300,
          left: 215,
          giftLeft: 0,
          giftPending: 2500,
          period: 'trial',
        })}
        isOwner
        impersonating={false}
      />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details-credits')).textContent).toContain(
      '85 / 300'
    );
    expect(screen.getByTestId('subscription-details-gift').textContent).toBe(
      'La prima plată primești 2.500 de credite de bun venit.'
    );
  });
});
