import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { env, organizationId } from '../billing/upstream.fixture';
import { creditPolicy } from './policy';
import { creditsStore } from './store';

const paid = {
  plan: 'start',
  status: 'active',
  created_at: '2026-10-14T08:00:00.000Z',
  trial_ends_at: '2026-11-13T08:00:00.000Z',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  tester_allowances: false,
  first_paid_at: '2026-11-13T08:00:00.000Z',
  billing_anchor_at: '2026-11-13T08:00:00.000Z',
  current_period_end: null,
  employee_step: 250,
};
const now = new Date('2026-12-01T10:00:00.000Z');

function upstream(answer: Record<string, unknown>) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/rest/v1/rpc/charge_credits') {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json(answer);
      }
      if (url.pathname === '/rest/v1/usage_extras') return Response.json({ ceiling_cents: 1000 });
      if (url.pathname === '/rest/v1/rpc/credit_balance') {
        return Response.json({
          granted: 0,
          used: 850,
          shortfall: 0,
          balance: 0,
          gift_left: 0,
          extra: 100,
          extra_left: 0,
        });
      }
      throw new Error(`Unexpected ${url.pathname}`);
    })
  );
  return bodies;
}

const charge = (store: ReturnType<typeof creditsStore>, policy = creditPolicy(paid, now)) =>
  store.charge({
    organizationId,
    policy,
    kind: 'safety_sheet',
    credits: 3,
    importId: null,
    key: 'sheet:1',
    require: true,
  });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('charging credits', () => {
  it("passes a block's price while extras may apply, and reports the blocks a charge bought", async () => {
    const bodies = upstream({
      charged: 3,
      refused: false,
      balance: 97,
      gift_left: 0,
      extra_blocks: 1,
    });
    const blocksBought = vi.fn();

    const result = await charge(creditsStore(adminClient(env), { blocksBought }));

    expect(bodies[0]).toMatchObject({ p_block_cents: 150 });
    expect(result).toEqual({
      charged: 3,
      refused: false,
      balance: 97,
      giftLeft: 0,
      extraBlocks: 1,
    });
    expect(blocksBought).toHaveBeenCalledWith(organizationId);
  });

  it('buys no block for a subscription past due, and reports nothing', async () => {
    const bodies = upstream({
      charged: 0,
      refused: true,
      balance: 0,
      gift_left: 0,
      extra_blocks: 0,
    });
    const blocksBought = vi.fn();

    await charge(
      creditsStore(adminClient(env), { blocksBought }),
      creditPolicy({ ...paid, status: 'past_due' }, now)
    );

    expect(bodies[0]).not.toHaveProperty('p_block_cents');
    expect(blocksBought).not.toHaveBeenCalled();
  });

  it('keeps the charge when the report fails, for the daily retry', async () => {
    upstream({ charged: 3, refused: false, balance: 97, gift_left: 0, extra_blocks: 1 });
    const blocksBought = vi.fn(async () => {
      throw new Error('Stripe is down');
    });

    expect(await charge(creditsStore(adminClient(env), { blocksBought }))).toMatchObject({
      charged: 3,
    });
  });

  it('counts what the ceiling can still buy, in whole blocks, as left to buy', async () => {
    upstream({});
    const balance = await creditsStore(adminClient(env)).balance(
      organizationId,
      creditPolicy(paid, now)
    );

    expect(balance).toMatchObject({ extra: 100, extraLeft: 500, extrasOn: true });
  });
});
