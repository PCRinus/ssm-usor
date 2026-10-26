import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubscriptionNotice } from './subscription-notice';

const inDays = (days: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
};

const trial = (endsIn: number): SubscriptionSummary => ({
  plan: 'profesional',
  status: 'trialing',
  trialEndsAt: inDays(endsIn),
  accessUntil: inDays(endsIn),
  access: 'full',
  deletesAt: null,
});

describe('SubscriptionNotice', () => {
  it('stays out of the way early in a trial and without a subscription', () => {
    const { container, rerender } = render(
      <SubscriptionNotice subscription={trial(20)} isOwner impersonating={false} />
    );
    expect(container.innerHTML).toBe('');
    rerender(<SubscriptionNotice subscription={null} isOwner impersonating={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('warns in the last week of a trial', () => {
    render(<SubscriptionNotice subscription={trial(3)} isOwner impersonating={false} />);
    expect(screen.getByTestId('subscription-trial-ending').textContent).toContain(
      'Perioada de probă se încheie în 3 zile'
    );
    expect(screen.getByRole('link', { name: 'contact@ssmusor.ro' }).getAttribute('href')).toBe(
      'mailto:contact@ssmusor.ro'
    );
  });

  it('tells a read-only organization until when it can download, and a specialist who acts', () => {
    render(
      <SubscriptionNotice
        subscription={{
          ...trial(0),
          trialEndsAt: '2026-11-25T10:00:00.000Z',
          accessUntil: '2026-11-25T10:00:00.000Z',
          access: 'read_only',
          deletesAt: '2026-12-25T10:00:00.000Z',
        }}
        isOwner={false}
        impersonating={false}
      />
    );
    const notice = screen.getByTestId('subscription-read-only').textContent;
    expect(notice).toContain('Perioada de probă s-a încheiat pe 25.11.2026.');
    expect(notice).toContain('până pe 25.12.2026');
    expect(notice).toContain('Administratorul organizației poate reactiva contul.');
  });
});
