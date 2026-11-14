import { describe, expect, it } from 'vitest';

import { smsUsage } from '@/test/billing-fixture';

import { codesLabel, smsBarFor, smsMeterFor, stopOf, trialSmsNote } from './sms-copy';

const owner = { owner: true, stop: 'month' } as const;
const member = { owner: false, stop: 'month' } as const;

describe('codesLabel', () => {
  it('counts codes the Romanian way', () => {
    expect(codesLabel(1)).toBe('1 cod');
    expect(codesLabel(12)).toBe('12 coduri');
    expect(codesLabel(300)).toBe('300 de coduri');
    expect(codesLabel(1200)).toBe('1.200 de coduri');
  });
});

describe('where the codes stop', () => {
  it('tells a paid month from a plan chosen in the trial and a tester', () => {
    expect(stopOf({ planChosen: true, status: 'active' })).toBe('month');
    expect(stopOf({ planChosen: true, status: 'past_due' })).toBe('month');
    expect(stopOf({ planChosen: true, status: 'trialing' })).toBe('firstPayment');
    expect(stopOf({ planChosen: false, status: 'trialing' })).toBe('tester');
  });
});

describe('the SMS meter', () => {
  it('says past the included codes they go by email, with no price, to the owner too', () => {
    const sms = smsUsage({ used: 142 });
    const forOwner = smsMeterFor(sms, owner);
    expect(forOwner).toMatchObject({ value: '142 din 300', tone: 'normal' });
    expect(forOwner.hint).toContain('Peste 300, codurile pleacă pe email');
    expect(forOwner.hint).not.toContain('€');
    expect(smsMeterFor(sms, member).hint).not.toContain('€');
  });

  it('warns from 80 % with what is left and when it renews', () => {
    const meter = smsMeterFor(smsUsage({ used: 252, state: 'near' }), owner);
    expect(meter.tone).toBe('warning');
    expect(meter.hint).toMatch(/^Mai ai 48 până pe .*\. Apoi codurile pleacă pe email/);
    expect(meter.hint).not.toContain('€');
  });

  it("says a paid month's codes are used up, until the renewal, without billing anything", () => {
    const meter = smsMeterFor(smsUsage({ used: 300, state: 'stopped' }), owner);
    expect(meter).toMatchObject({ value: '300 din 300', tone: 'danger' });
    expect(meter.hint).toMatch(/^Ai folosit cele 300 ale lunii\. Până pe .*, codurile pleacă/);
    expect(meter.hint).not.toContain('€');
  });

  it("tells a tester's trial to write for more", () => {
    const tester = smsUsage({ used: 300, state: 'stopped' });
    expect(smsMeterFor(tester, { owner: true, stop: 'tester' }).hint).toContain('Scrie-ne');
  });

  it('stops a plan chosen in the trial until the first payment, with no price', () => {
    const chosen = smsUsage({ used: 50, included: 50, allowance: 50, state: 'stopped' });
    const hint = smsMeterFor(chosen, { owner: true, stop: 'firstPayment' }).hint;
    expect(hint).toContain('de până la prima plată');
    expect(hint).not.toContain('€');
    expect(
      smsMeterFor({ ...chosen, used: 4, state: 'ok' }, { owner: true, stop: 'firstPayment' }).hint
    ).toBe('Până la prima plată, codurile se opresc la 50.');
  });

  it('draws no bar where no SMS goes, and none without a limit', () => {
    expect(smsMeterFor(smsUsage({ state: 'none', included: 0 }), owner)).toMatchObject({
      used: null,
      hint: trialSmsNote,
    });
    expect(
      smsMeterFor(smsUsage({ used: 12, included: null, allowance: null }), owner)
    ).toMatchObject({ used: null, limit: null, value: '12' });
  });
});

describe('the SMS bar', () => {
  it('shows from 80 %, closable, and says past the included codes they go by email', () => {
    expect(smsBarFor(smsUsage({ used: 200 }), owner)).toBeNull();
    expect(smsBarFor(smsUsage({ state: 'none' }), owner)).toBeNull();
    const near = smsBarFor(smsUsage({ used: 252, state: 'near' }), owner)!;
    expect(near).toMatchObject({ kind: 'sms', state: 'near', closable: true });
    expect(near.detail).toContain('Peste 300, codurile pleacă pe email.');
    expect(near.detail).not.toContain('€');
  });

  it('stays, red, once the codes have stopped, naming whose they were', () => {
    const bar = smsBarFor(smsUsage({ used: 300, state: 'stopped' }), owner)!;
    expect(bar).toMatchObject({ kind: 'smsStop', state: 'stopped', closable: false });
    expect(bar.detail).toContain('Ai folosit cele 300 de coduri ale lunii.');
    expect(
      smsBarFor(smsUsage({ used: 50, included: 50, state: 'stopped' }), {
        owner: true,
        stop: 'firstPayment',
      })!.detail
    ).toContain('de până la prima plată');
  });
});
