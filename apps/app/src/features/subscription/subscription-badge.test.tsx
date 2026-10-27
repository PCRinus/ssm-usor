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
import { afterEach, describe, expect, it } from 'vitest';

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
      <SubscriptionBadge subscription={trial(20)} isOwner impersonating={false} />
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
      <SubscriptionBadge subscription={chosen(12)} isOwner impersonating={false} />
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
      <SubscriptionBadge subscription={readOnly} isOwner={false} impersonating={false} />
    );
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details')).textContent).toContain(
      'Administratorul organizației se ocupă de abonament.'
    );
    expect(screen.getByRole('link', { name: 'Vezi abonamentul' })).toBeTruthy();
    unmount();

    await renderRouted(<SubscriptionBadge subscription={readOnly} isOwner impersonating />);
    await userEvent.click(await screen.findByTestId('subscription-badge'));
    const details = await screen.findByTestId('subscription-details');
    expect(details.textContent).not.toContain('Administratorul organizației');
    expect(screen.queryByRole('link', { name: 'Alege un plan' })).toBeNull();
  });
});

describe('SubscriptionBar', () => {
  it('stays hidden earlier in a trial, and once a plan is chosen', async () => {
    const { container, unmount } = await renderRouted(
      <SubscriptionBar subscription={trial(20)} canAct />
    );
    expect(container.innerHTML).toBe('');
    unmount();

    const chosenBar = await renderRouted(<SubscriptionBar subscription={chosen(3)} canAct />);
    expect(chosenBar.container.innerHTML).toBe('');
  });

  it('closes until tomorrow in the last week of a trial, and leads the owner to a plan', async () => {
    const { unmount } = await renderRouted(<SubscriptionBar subscription={trial(5)} canAct />);
    expect((await screen.findByTestId('subscription-bar-action')).getAttribute('href')).toBe(
      '/organization/subscription'
    );
    expect(screen.getByTestId('subscription-bar-action').textContent).toBe('Alege un plan');
    await userEvent.click(screen.getByTestId('subscription-bar-close'));
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
    unmount();

    await renderRouted(<SubscriptionBar subscription={trial(5)} canAct />);
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
  });

  it('cannot be closed on the last day, nor while read-only', async () => {
    const { unmount } = await renderRouted(<SubscriptionBar subscription={trial(1)} canAct />);
    expect((await screen.findByTestId('subscription-bar')).textContent).toContain(
      'se încheie mâine'
    );
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    unmount();

    await renderRouted(<SubscriptionBar subscription={readOnly} canAct={false} />);
    expect((await screen.findByTestId('subscription-bar')).dataset.kind).toBe('readOnly');
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    expect(screen.queryByTestId('subscription-bar-action')).toBeNull();
  });

  it('sends the owner to the tab to update the card after a failed payment', async () => {
    await renderRouted(<SubscriptionBar subscription={pastDue} canAct />);
    const action = await screen.findByTestId('subscription-bar-action');
    expect(action.textContent).toBe('Actualizează cardul');
    expect(action.getAttribute('href')).toBe('/organization/subscription');
  });
});
