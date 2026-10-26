import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SubscriptionBadge } from './subscription-badge';
import { SubscriptionBar } from './subscription-bar';

const inDays = (days: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
};

const trial = (days: number): SubscriptionSummary => ({
  plan: 'profesional',
  status: 'trialing',
  trialEndsAt: inDays(days),
  accessUntil: inDays(days),
  access: 'full',
  deletesAt: null,
});

const readOnly: SubscriptionSummary = {
  ...trial(-2),
  access: 'read_only',
  deletesAt: inDays(28),
};

afterEach(() => localStorage.clear());

describe('SubscriptionBadge', () => {
  it('opens the trial details, with a way to continue for the owner', async () => {
    render(<SubscriptionBadge subscription={trial(20)} isOwner impersonating={false} />);

    expect(screen.getByTestId('subscription-badge').textContent).toBe('Probă · 20 de zile');
    await userEvent.click(screen.getByTestId('subscription-badge'));

    const details = await screen.findByTestId('subscription-details');
    expect(details.textContent).toContain('Mai ai 20 de zile');
    expect(screen.getByRole('link', { name: 'Scrie-ne ca să continui' }).getAttribute('href')).toBe(
      'mailto:contact@ssmusor.ro'
    );
  });

  it('tells a specialist who decides, and support acting as the owner nothing to do', async () => {
    const { unmount } = render(
      <SubscriptionBadge subscription={readOnly} isOwner={false} impersonating={false} />
    );
    await userEvent.click(screen.getByTestId('subscription-badge'));
    expect((await screen.findByTestId('subscription-details')).textContent).toContain(
      'Administratorul organizației se ocupă de abonament.'
    );
    unmount();

    render(<SubscriptionBadge subscription={readOnly} isOwner impersonating />);
    await userEvent.click(screen.getByTestId('subscription-badge'));
    await screen.findByTestId('subscription-details');
    expect(screen.queryByRole('link', { name: 'Scrie-ne ca să continui' })).toBeNull();
  });
});

describe('SubscriptionBar', () => {
  it('stays hidden earlier in a trial', () => {
    const { container } = render(<SubscriptionBar subscription={trial(20)} canAct />);
    expect(container.innerHTML).toBe('');
  });

  it('closes until tomorrow in the last week of a trial', async () => {
    const { unmount } = render(<SubscriptionBar subscription={trial(5)} canAct />);
    await userEvent.click(screen.getByTestId('subscription-bar-close'));
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
    unmount();

    render(<SubscriptionBar subscription={trial(5)} canAct />);
    expect(screen.queryByTestId('subscription-bar')).toBeNull();
  });

  it('cannot be closed on the last day, nor while read-only', () => {
    const { unmount } = render(<SubscriptionBar subscription={trial(1)} canAct />);
    expect(screen.getByTestId('subscription-bar').textContent).toContain('se încheie mâine');
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    unmount();

    render(<SubscriptionBar subscription={readOnly} canAct={false} />);
    expect(screen.getByTestId('subscription-bar').dataset.kind).toBe('readOnly');
    expect(screen.queryByTestId('subscription-bar-close')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Scrie-ne' })).toBeNull();
  });
});
