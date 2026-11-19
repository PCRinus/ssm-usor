import { describe, expect, it } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { routeUpstream, stubFetch } from '../../test/upstream';
import {
  addMonths,
  entitlementColumns,
  loadEntitlementRow,
  loadEntitlementRows,
  monthAround,
} from './entitlements';
import { env, organizationId } from './upstream.fixture';

const at = (iso: string) => new Date(iso);
const iso = (period: { start: Date; end: Date }) => [
  period.start.toISOString(),
  period.end.toISOString(),
];

const row = (id: string) => ({
  organization_id: id,
  plan: 'start',
  status: 'active',
  created_at: '2026-10-14T08:00:00.000Z',
  trial_ends_at: null,
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  tester_allowances: false,
  first_paid_at: '2026-11-13T08:00:00.000Z',
  billing_anchor_at: '2026-11-13T08:00:00.000Z',
  current_period_end: null,
  employee_step: 250,
});

function upstream(answer: (url: URL) => Response) {
  const urls: URL[] = [];
  routeUpstream({
    '/*': ({ url }) => {
      urls.push(url);
      return answer(url);
    },
  });
  return urls;
}

stubFetch();

describe("the subscription's month", () => {
  it("adds months on the anchor's day, or the month's last day where it is shorter, as Stripe does", () => {
    const anchor = at('2026-01-31T10:00:00.000Z');
    expect(addMonths(anchor, 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(anchor, 2).toISOString()).toBe('2026-03-31T10:00:00.000Z');
    expect(addMonths(anchor, -2).toISOString()).toBe('2025-11-30T10:00:00.000Z');
  });

  it('finds the month a moment falls in, from 14.10 to 13.11', () => {
    const anchor = at('2026-06-14T09:30:00.000Z');
    expect(iso(monthAround(anchor, at('2026-10-20T12:00:00.000Z')))).toEqual([
      '2026-10-14T09:30:00.000Z',
      '2026-11-14T09:30:00.000Z',
    ]);
    expect(iso(monthAround(anchor, at('2026-10-14T09:30:00.000Z')))[0]).toBe(
      '2026-10-14T09:30:00.000Z'
    );
    expect(iso(monthAround(anchor, at('2026-10-14T09:29:59.000Z')))[0]).toBe(
      '2026-09-14T09:30:00.000Z'
    );
  });
});

describe("loading an organization's subscription", () => {
  it('reads the columns the allowances need for one organization', async () => {
    const urls = upstream(() => Response.json(row(organizationId)));
    const found = await loadEntitlementRow(adminClient(env), organizationId);
    expect(found).toEqual(row(organizationId));
    expect(urls[0]!.pathname).toBe('/rest/v1/subscriptions');
    expect(urls[0]!.searchParams.get('select')).toBe(entitlementColumns.replaceAll(' ', ''));
    expect(urls[0]!.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
  });

  it('answers null for an organization without one', async () => {
    upstream(() => Response.json([]));
    expect(await loadEntitlementRow(adminClient(env), organizationId)).toBeNull();
  });

  it('reads several at once, keyed by organization, and asks nothing for none', async () => {
    const urls = upstream(() => Response.json([row('org-a'), row('org-b')]));
    const db = adminClient(env);
    expect((await loadEntitlementRows(db, [])).size).toBe(0);
    expect(urls).toHaveLength(0);
    const found = await loadEntitlementRows(db, ['org-a', 'org-b']);
    expect([...found.keys()]).toEqual(['org-a', 'org-b']);
    expect(urls[0]!.searchParams.get('organization_id')).toBe('in.(org-a,org-b)');
  });
});
