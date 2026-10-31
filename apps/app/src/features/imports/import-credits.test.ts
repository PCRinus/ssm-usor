import { describe, expect, it } from 'vitest';

import {
  activeSubscription,
  summaryOf,
  trialChosenSubscription,
  trialSubscription,
} from '@/test/billing-fixture';
import { meWithCredits } from '@/test/import-fixture';

import {
  creditsBalance,
  creditsLabel,
  creditsRefusal,
  leftSentence,
  noneText,
  refusalFromApi,
  refusalSentence,
  shortText,
  usedSentence,
  usesSentence,
} from './import-credits';

const paid = (credits = {}) => creditsBalance(meWithCredits(credits))!;

const trial = (credits = {}, subscription = trialSubscription()) =>
  creditsBalance(
    meWithCredits(
      {
        used: 34,
        included: 300,
        allowance: 300,
        left: 266,
        giftLeft: 0,
        period: 'trial',
        periodEnd: '2026-11-08T08:00:00.000Z',
        ...credits,
      },
      summaryOf(subscription)
    )
  )!;

describe('counting credits in Romanian', () => {
  it('writes "de" from twenty on and groups thousands', () => {
    expect(creditsLabel(1)).toBe('1 credit');
    expect(creditsLabel(18)).toBe('18 credite');
    expect(creditsLabel(25)).toBe('25 de credite');
    expect(creditsLabel(101)).toBe('101 credite');
    expect(creditsLabel(1500)).toBe('1.500 de credite');
  });
});

describe('what an import will use', () => {
  it('counts 25 for a client, and the photographs beside the documents', () => {
    expect(usesSentence('client', { photos: 0, pages: 0, pdfs: 0 })).toBe(
      'Folosește 25 de credite, plus 1 pentru fiecare pagină scanată.'
    );
    expect(usesSentence('client', { photos: 3, pages: 0, pdfs: 0 })).toBe(
      'Folosește 28 de credite (25 + 3 fotografii), plus 1 pentru fiecare pagină scanată.'
    );
  });

  it('counts one for each photograph or page of an employee import', () => {
    expect(usesSentence('employees', { photos: 0, pages: 98, pdfs: 0 })).toBe(
      'Folosește 98 de credite, unul pe fotografie.'
    );
    expect(usesSentence('employees', { photos: 0, pages: 14, pdfs: 2 })).toBe(
      'Folosește 14 credite, unul pe fotografie sau pagină.'
    );
    expect(usesSentence('employees', { photos: 0, pages: 0, pdfs: 0 })).toBe(
      'Folosește un credit pe fotografie.'
    );
  });
});

describe('what is left before it starts', () => {
  it("names the month's credits and the gift's on a paid plan", () => {
    expect(leftSentence(paid(), false)).toBe(
      'Îți mai rămân 1.270 din 1.500 luna aceasta și 7.840 din cadoul de bun venit.'
    );
    expect(leftSentence(paid({ giftLeft: 0, left: 40 }), false)).toBe(
      'Îți mai rămân 40 din 1.500 luna aceasta.'
    );
  });

  it("names the trial's 300", () => {
    expect(leftSentence(trial(), false)).toBe(
      'Îți mai rămân 266 din cele 300 ale perioadei de probă.'
    );
  });

  it('says until when, once it is short', () => {
    expect(leftSentence(paid({ left: 18, giftLeft: 0 }), true)).toBe(
      'Îți mai rămân 18 până pe 14 noiembrie.'
    );
  });

  it('leaves the line out when nothing limits the credits', () => {
    expect(creditsBalance(meWithCredits({ left: null, state: 'unlimited' }))).toBeNull();
    expect(creditsBalance(undefined)).toBeNull();
  });
});

describe('refusing an import the credits do not cover', () => {
  it('refuses a client import under 25, saying when they renew', () => {
    const balance = paid({ left: 18, giftLeft: 0 });
    const refusal = creditsRefusal(balance, 25);
    expect(refusal).toEqual({
      kind: 'short',
      needed: 25,
      available: 18,
      renewsAt: '2026-11-14T08:00:00.000Z',
    });
    expect(shortText('client', refusal as never, balance)).toEqual({
      title: 'Nu ajung creditele pentru acest import',
      text: 'Citirea documentelor unui client folosește 25 de credite, iar ție îți mai rămân 18. Pe 14 noiembrie primești alte 1.500 și poți porni importul.',
    });
  });

  it('counts the gift with the month', () => {
    expect(creditsRefusal(paid({ left: 10, giftLeft: 20 }), 25)).toBeNull();
  });

  it('suggests a smaller employee import now and the rest after renewal', () => {
    const balance = paid({ left: 60, giftLeft: 0 });
    expect(shortText('employees', creditsRefusal(balance, 98) as never, balance)).toEqual({
      title: 'Nu ajung creditele pentru toate fotografiile',
      text: 'Cele 98 de fotografii folosesc 98 de credite, iar ție îți mai rămân 60 până pe 14 noiembrie. Scoate o parte și păstreaz-o pentru un import după reînnoire, cu toate fotografiile unei persoane în același import.',
    });
    expect(
      shortText('employees', creditsRefusal(balance, 98) as never, balance, true).text
    ).toMatch(/^Cele 98 de fotografii și pagini folosesc 98 de credite/);
  });

  it('says nothing is left, with the gift, at zero or below', () => {
    const balance = paid({ left: -4, giftLeft: 0, state: 'negative' });
    expect(creditsRefusal(balance, 25)).toEqual({ kind: 'none' });
    expect(noneText('client', balance)).toEqual({
      title: 'Nu mai ai credite pentru importuri',
      text: 'Ai folosit cele 1.500 de credite ale lunii și pe cele de bun venit. Pe 14 noiembrie primești alte 1.500 și poți porni importul. Până atunci nu poți porni un import nou din documente.',
    });
  });

  it("says a trial's credits do not renew, and what the first payment brings once a plan is chosen", () => {
    expect(noneText('client', trial({ left: 0 })).text).toBe(
      'Ai folosit cele 300 de credite ale perioadei de probă. Creditele perioadei de probă nu se reînnoiesc. La prima plată primești creditele lunii și pe cele de bun venit. Până atunci nu poți porni un import nou din documente.'
    );
    const chosen = trial({ left: 0, giftPending: 2500 }, trialChosenSubscription());
    expect(noneText('employees', chosen).text).toBe(
      'Ai folosit cele 300 de credite ale perioadei de probă. Pe 8 noiembrie, la prima plată, primești 300 de credite pe lună și 2.500 de credite de bun venit. Până atunci nu poți porni un import nou din fișe.'
    );
  });

  it('reads the figures of a start the API refused', () => {
    const short = { needed: 25, left: 12, renewsAt: '2026-11-14T08:00:00.000Z' };
    expect(refusalFromApi(short)).toEqual({
      kind: 'short',
      needed: 25,
      available: 12,
      renewsAt: '2026-11-14T08:00:00.000Z',
    });
    expect(refusalFromApi({ ...short, left: 0 })).toEqual({ kind: 'none' });
    expect(refusalSentence(short)).toBe(
      'Nu ajung creditele: importul folosește 25 de credite, iar ție îți mai rămân 12 până pe 14 noiembrie. Scrie-ne la contact@ssmusor.ro și îți adăugăm credite.'
    );
  });

  it('renews nothing on a subscription that is ending', () => {
    const ending = summaryOf(
      activeSubscription({ interval: 'month', accessUntil: '2026-11-14T08:00:00.000Z' })
    );
    expect(creditsBalance(meWithCredits({ left: 0, giftLeft: 0 }, ending))!.renewal).toBeNull();
  });
});

describe('what an import used', () => {
  it('splits a client import into the reading and the scanned pages', () => {
    expect(
      usedSentence({ used: 34, atStart: 25, scannedPages: 9, refunded: false }, 'client')
    ).toBe('Importul a folosit 34 de credite (25 + 9 pagini scanate).');
    expect(
      usedSentence({ used: 26, atStart: 25, scannedPages: 1, refunded: false }, 'client')
    ).toBe('Importul a folosit 26 de credite (25 + 1 pagină scanată).');
    expect(
      usedSentence({ used: 25, atStart: 25, scannedPages: 0, refunded: false }, 'client')
    ).toBe('Importul a folosit 25 de credite.');
  });

  it('gives the total of an employee import', () => {
    expect(
      usedSentence({ used: 98, atStart: 98, scannedPages: 0, refunded: false }, 'employees')
    ).toBe('Importul a folosit 98 de credite.');
  });
});
