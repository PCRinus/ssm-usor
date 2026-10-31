import { describe, expect, it } from 'vitest';

import { creditsUsage } from '@/test/billing-fixture';

import { creditsCount, creditsMeterFor, giftPanelFor } from './credits-copy';
import { roDate } from './subscription-copy';

const paid = { kind: 'paid' } as const;

describe('creditsCount', () => {
  it('counts credits the Romanian way', () => {
    expect(creditsCount(1)).toBe('1 credit');
    expect(creditsCount(12)).toBe('12 credite');
    expect(creditsCount(300)).toBe('300 de credite');
    expect(creditsCount(10000)).toBe('10.000 de credite');
  });
});

describe('the credits meter', () => {
  it('says when the month renews, and that what is left does not carry over', () => {
    const credits = creditsUsage();
    expect(creditsMeterFor(credits, paid)).toMatchObject({
      value: '640 din 1.500',
      tone: 'normal',
      hint: `Se reînnoiesc pe ${roDate(credits.periodEnd)}; cele nefolosite nu se adună.`,
    });
  });

  it('turns amber when little is left, in clients it still covers', () => {
    const meter = creditsMeterFor(
      creditsUsage({ used: 1310, left: 190, giftLeft: 0, state: 'near' }),
      paid
    );
    expect(meter.tone).toBe('warning');
    expect(meter.hint).toMatch(
      /^Mai ai 190, cât pentru vreo 7 clienți\. Pe \d\d\.\d\d\.\d{4} primești alte 1\.500\.$/
    );
  });

  it('turns red when used up, with the renewal and the offer to add credits', () => {
    const meter = creditsMeterFor(
      creditsUsage({ used: 1500, left: 0, giftLeft: 0, state: 'out' }),
      paid
    );
    expect(meter.tone).toBe('danger');
    expect(meter.hint).toMatch(
      /^Nu poți porni un import nou până pe \d\d\.\d\d\.\d{4}, când primești alte 1\.500\./
    );
    expect(meter.hint).toContain('Scrie-ne la contact@ssmusor.ro și îți adăugăm credite.');
  });

  it('shows a balance below zero, shortened on a phone with the sentence in the hint', () => {
    const meter = creditsMeterFor(
      creditsUsage({ used: 1504, left: -4, giftLeft: 0, state: 'negative' }),
      paid
    );
    expect(meter).toMatchObject({
      value: '−4 · se scad din luna viitoare',
      valueShort: '−4',
      tone: 'over',
    });
    expect(meter.hint).toContain('primești 1.496 în loc de 1.500');
    expect(meter.hint).not.toContain('Cele 4 se scad');
    expect(meter.hintShort).toContain('Cele 4 se scad din luna viitoare.');
  });

  it('says what the last month took off', () => {
    const meter = creditsMeterFor(
      creditsUsage({ used: 100, shortfall: 4, left: 1396, giftLeft: 0 }),
      paid
    );
    expect(meter.value).toBe('100 din 1.496');
    expect(meter.hint).toContain('Luna aceasta ai 1.496: 4 s-au scăzut pentru luna trecută.');
  });

  it('tells a trial its credits last the whole trial, and what a chosen plan brings', () => {
    const trial = creditsUsage({
      used: 85,
      included: 300,
      allowance: 300,
      left: 215,
      giftLeft: 0,
      period: 'trial',
    });
    expect(creditsMeterFor(trial, { kind: 'trial', nextMonthly: null }).hint).toMatch(
      /^Pentru toată perioada de probă, până pe \d\d\.\d\d\.\d{4}\. Nu se reînnoiesc\.$/
    );
    expect(
      creditsMeterFor({ ...trial, giftPending: 10000 }, { kind: 'trial', nextMonthly: 1500 }).hint
    ).toMatch(
      /^Cele 300 din perioada de probă, până la prima plată\. De pe \d\d\.\d\d\.\d{4} primești 1\.500 pe lună\.$/
    );
  });

  it('gives a tester a hard stop a month', () => {
    expect(creditsMeterFor(creditsUsage({ giftLeft: 0 }), { kind: 'tester' }).hint).toMatch(
      /^Cont de test: 1\.500 pe lună\. La 1\.500, importurile se opresc până pe/
    );
  });

  it("says the welcome gift is in use once the month's are gone", () => {
    const meter = creditsMeterFor(creditsUsage({ used: 1500, left: 0, giftLeft: 8000 }), paid);
    expect(meter.hint).toMatch(
      /^Creditele lunii s-au terminat, așa că importurile folosesc acum creditele de bun venit\./
    );
  });
});

describe('the welcome gift', () => {
  it('shows what is left of it, then that it is spent', () => {
    expect(giftPanelFor(creditsUsage(), { paid: true, welcomeCredits: 10000 })).toEqual({
      look: 'balance',
      title: 'Credite de bun venit',
      text: 'Rămase din 10.000. Nu expiră și se folosesc după creditele lunii.',
      value: '8.640',
    });
    expect(
      giftPanelFor(creditsUsage({ giftLeft: 0 }), { paid: true, welcomeCredits: 10000 })
    ).toMatchObject({
      look: 'spent',
      value: '0',
      text: 'Le-ai folosit pe toate cele 10.000. Nu se mai primesc.',
    });
  });

  it('promises it to a plan chosen during the trial, and shows none in a plain trial', () => {
    const trial = creditsUsage({ period: 'trial', giftLeft: 0, included: 300, left: 215 });
    expect(
      giftPanelFor({ ...trial, giftPending: 10000 }, { paid: false, welcomeCredits: null })
    ).toMatchObject({
      look: 'promise',
      title: 'La prima plată primești 10.000 de credite de bun venit.',
    });
    expect(giftPanelFor(trial, { paid: false, welcomeCredits: null })).toBeNull();
  });
});
