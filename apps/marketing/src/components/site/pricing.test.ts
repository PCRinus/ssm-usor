import { smsOverage, trialDays as appTrialDays } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { faq } from './copy';
import {
  aiCredits,
  calculator,
  cardStates,
  compare,
  type CompareRow,
  eur,
  extras,
  monthlyAt,
  narrowStopLabels,
  paidYearly,
  perMonth,
  pricingCta,
  pricingPage,
  profesional,
  quote,
  smsCodes,
  start,
  trialDays,
  welcomeCredits,
  workerStops,
} from './pricing';

const decided = {
  start: [
    { workers: 250, monthly: 39, annual: 32, yearly: 384, sms: 50, credits: 750, welcome: 2500 },
    { workers: 500, monthly: 59, annual: 49, yearly: 588, sms: 100, credits: 1250, welcome: 5000 },
    { workers: 750, monthly: 79, annual: 65, yearly: 780, sms: 150, credits: 1750, welcome: 7500 },
  ],
  profesional: [
    { workers: 500, monthly: 89, annual: 74, yearly: 888, sms: 100, credits: 1250, welcome: 5000 },
    {
      workers: 1000,
      monthly: 119,
      annual: 99,
      yearly: 1188,
      sms: 200,
      credits: 2250,
      welcome: 10000,
    },
    {
      workers: 1500,
      monthly: 149,
      annual: 124,
      yearly: 1488,
      sms: 300,
      credits: 3250,
      welcome: 10000,
    },
  ],
};

function cells(label: string) {
  const rows = compare.groups.flatMap<CompareRow>((group) => group.rows);
  return rows.find((row) => row.label === label)?.cells;
}

describe('the steps', () => {
  it.each([
    ['start', start],
    ['profesional', profesional],
  ] as const)('%s matches the decided table', (id, plan) => {
    for (const row of decided[id]) {
      expect(monthlyAt(plan, row.workers)).toBe(row.monthly);
      expect(perMonth(row.monthly, 'monthly')).toBe(row.monthly);
      expect(perMonth(row.monthly, 'annual')).toBe(row.annual);
      expect(paidYearly(row.monthly)).toBe(row.yearly);
      expect(smsCodes(row.workers)).toBe(row.sms);
      expect(aiCredits(row.workers)).toBe(row.credits);
      expect(welcomeCredits(row.workers)).toBe(row.welcome);
    }
  });

  it('Start has three steps of 250, Profesional seven from 500 to 5.000', () => {
    expect(start.steps).toEqual([250, 500, 750]);
    expect(profesional.steps).toEqual([500, 1000, 1500, 2000, 3000, 4000, 5000]);
  });

  it('Profesional above 1.500 costs 30 € a month more for every 500 workers', () => {
    expect(
      profesional.steps.filter((step) => step > 1500).map((step) => monthlyAt(profesional, step))
    ).toEqual([179, 239, 299, 359]);
    expect(
      [179, 239, 299, 359].map((monthly) => [perMonth(monthly, 'annual'), paidYearly(monthly)])
    ).toEqual([
      [149, 1788],
      [199, 2388],
      [249, 2988],
      [299, 3588],
    ]);
    expect(profesional.steps.slice(3).map((step) => [smsCodes(step), aiCredits(step)])).toEqual([
      [400, 4250],
      [600, 6250],
      [800, 8250],
      [1000, 10250],
    ]);
  });

  it('welcome credits stop at 10.000', () => {
    expect(welcomeCredits(1000)).toBe(10000);
    expect(welcomeCredits(5000)).toBe(10000);
  });

  it('the slider stops at every step, then past 5.000', () => {
    expect(workerStops).toEqual([250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, null]);
  });

  it('the labels kept on a phone are slider stops, from the first to past the last', () => {
    expect(narrowStopLabels.every((label) => workerStops.includes(label))).toBe(true);
    expect(narrowStopLabels[0]).toBe(workerStops[0]);
    expect(narrowStopLabels.at(-1)).toBe(null);
  });

  it('the SMS extra matches the rate Stripe charges', () => {
    expect(extras.sms * 100).toBe(smsOverage.price.unitAmount);
  });
});

describe('the pricing cards', () => {
  const recommended = (workers: number | null) =>
    cardStates(workers, 'annual').find((card) => card.recommended)?.id;

  it('recommend Start up to 750, Profesional to 5.000, then Enterprise', () => {
    expect([250, 500, 750].map(recommended)).toEqual(['start', 'start', 'start']);
    expect([1000, 3000, 5000].map(recommended)).toEqual([
      'profesional',
      'profesional',
      'profesional',
    ]);
    expect(recommended(null)).toBe('enterprise');
  });

  it('show annual by month with the yearly sum, or the monthly price', () => {
    const [annualStart, annualProf] = cardStates(500, 'annual');
    expect(annualStart!.price).toBe('49 €');
    expect(annualStart!.yearly).toBe('plătit anual: 588 € + TVA');
    expect(annualProf!.price).toBe('74 €');
    const [monthlyStart] = cardStates(500, 'monthly');
    expect(monthlyStart!.price).toBe('59 €');
    expect(monthlyStart!.yearly).toBe('');
  });

  it('at 250 Profesional shows its 500 step', () => {
    const [, prof] = cardStates(250, 'monthly');
    expect(prof!.price).toBe('89 €');
    expect(prof!.allowance).toEqual({
      before: '100 de coduri SMS și 1.250 de ',
      after: ' pe lună',
    });
  });

  it('past 750 Start is dimmed at its last step and points to Profesional', () => {
    const [startCard, prof] = cardStates(1000, 'monthly');
    expect(startCard!.dim).toBe(true);
    expect(startCard!.price).toBe('79 €');
    expect(startCard!.allowance).toEqual({ text: 'Pentru 1.000 de lucrători, alege Profesional.' });
    expect(startCard!.extra).toBe('');
    expect(prof!.dim).toBe(false);
    expect(prof!.price).toBe('119 €');
  });

  it('past 5.000 only Enterprise stays lit', () => {
    const [startCard, prof, ent] = cardStates(null, 'annual');
    expect(startCard!.dim && prof!.dim).toBe(true);
    expect(prof!.price).toBe('299 €');
    expect(prof!.allowance).toEqual({ text: 'Peste 5.000 de lucrători, îți facem o ofertă.' });
    expect(ent!.dim).toBe(false);
  });

  it('say what costs more than the allowance, at the decided rates', () => {
    expect(cardStates(500, 'annual')[0]!.extra.replaceAll('\u00a0', ' ')).toBe(
      '0,10 € / SMS extra\n1,50 € / 100 de credite AI extra'
    );
    expect(cardStates(1000, 'annual')[1]!.extra).toBe(cardStates(500, 'annual')[1]!.extra);
  });

  it('show 2.100 workers on the 3.000 step', () => {
    const [startCard, prof] = cardStates(2100, 'monthly');
    expect(startCard!.dim).toBe(true);
    expect(prof!.price).toBe('239 €');
  });
});

describe('quote', () => {
  it.each(
    decided.start.flatMap((row) =>
      (['monthly', 'annual'] as const).map((period) => [row.workers, period, row] as const)
    )
  )('Start at %i workers, %s', (workers, period, row) => {
    const result = quote(workers, 1, period);
    expect(result.plan.id).toBe('start');
    expect(result.step).toBe(workers);
    expect(result.perMonth).toBe(period === 'annual' ? row.annual : row.monthly);
    expect(result.yearly).toBe(period === 'annual' ? row.yearly : undefined);
    expect(result.lines.map((line) => line.value)).toEqual([
      eur(period === 'annual' ? row.annual : row.monthly),
      '3',
      row.sms.toLocaleString('ro-RO'),
      row.credits.toLocaleString('ro-RO'),
      row.welcome.toLocaleString('ro-RO'),
      ...(period === 'annual' ? [eur(row.yearly)] : []),
    ]);
  });

  it.each(
    profesional.steps.flatMap((step) =>
      (['monthly', 'annual'] as const).map((period) => [step, period] as const)
    )
  )('Profesional at %i workers, %s', (step, period) => {
    const result = quote(step, 4, period);
    const monthly = monthlyAt(profesional, step);
    expect(result.plan.id).toBe('profesional');
    expect(result.step).toBe(step);
    expect(result.perMonth).toBe(perMonth(monthly, period));
    expect(result.lines[1]!.value).toBe('10');
  });

  it('rounds the head count up to the next step', () => {
    expect(quote(50, 1, 'monthly').step).toBe(250);
    expect(quote(260, 1, 'monthly').step).toBe(500);
    expect(quote(751, 1, 'monthly')).toMatchObject({ plan: profesional, step: 1000 });
    expect(quote(1550, 1, 'monthly').step).toBe(2000);
    expect(quote(2100, 1, 'monthly')).toMatchObject({ step: 3000, perMonth: 239 });
    expect(quote(4050, 1, 'monthly')).toMatchObject({ step: 5000, perMonth: 359 });
    expect(quote(5000, 1, 'monthly').step).toBe(5000);
  });

  it('more than 3 people go on Profesional, at its own smallest step', () => {
    expect(quote(250, 3, 'monthly').plan.id).toBe('start');
    expect(quote(250, 4, 'monthly')).toMatchObject({ plan: profesional, step: 500, perMonth: 89 });
    expect(quote(600, 4, 'monthly').advice).toBe(
      'Start are cel mult 3 utilizatori, așa că o echipă de 4 merge pe Profesional.'
    );
  });

  it('more than 10 people or more than 5.000 workers ask for an offer', () => {
    expect(quote(5000, 10, 'annual').plan.id).toBe('profesional');
    expect(quote(5000, 11, 'annual')).toMatchObject({
      plan: { id: 'enterprise' },
      advice: 'Peste 10 utilizatori îți facem o ofertă după mărimea echipei tale.',
    });
    expect(quote(5050, 1, 'annual')).toMatchObject({
      plan: { id: 'enterprise' },
      advice: 'Peste 5.000 de lucrători îți facem o ofertă după mărimea firmei tale.',
    });
    expect(quote(5050, 1, 'annual').lines[0]).toEqual({ label: 'Lucrători', value: 'peste 5.000' });
  });

  it("Start's advice names Profesional's price in the same period", () => {
    expect(quote(250, 1, 'annual').advice).toBe(
      'Rămâi la același preț până la 250 de lucrători. Dacă vrei 10 utilizatori sau oferte pentru firmele care nu îți sunt încă clienți, Profesional costă 74 € pe lună.'
    );
  });
});

describe('the copy', () => {
  it('the comparison table follows the rules', () => {
    expect(cells('Lucrători la clienții tăi')).toEqual([
      '250, 500 sau 750',
      '500, 1.000, 1.500, 2.000, 3.000, 4.000 sau 5.000',
      'Peste 5.000',
    ]);
    expect(cells('Utilizatori')).toEqual(['3', '10', 'Peste 10']);
    expect(cells('Coduri de semnare prin SMS, pe lună')?.slice(0, 2)).toEqual([
      'Unul la 5 lucrători: 50, 100 sau 150',
      'Unul la 5 lucrători: de la 100 la 1.000',
    ]);
    expect(cells('Credite AI, pe lună')?.slice(0, 2)).toEqual([
      '2 la fiecare lucrător, plus 250: 750, 1.250 sau 1.750',
      '2 la fiecare lucrător, plus 250: de la 1.250 la 10.250',
    ]);
  });

  it('no sentence still steps Profesional every 500 workers', () => {
    const texts = [
      ...pricingPage.faq.map((item) => item.a),
      ...calculator.summaries.map((summary) => summary.text),
      ...compare.groups.flatMap((group) => group.rows.flatMap((row) => row.cells.map(String))),
    ];
    expect(texts.join(' ')).not.toMatch(/din 500 în 500|pentru fiecare 500/);
    expect(pricingPage.faq[1]!.a).toContain(
      'Profesional, care are trepte de 500, 1.000, 1.500, 2.000, 3.000, 4.000 și 5.000.'
    );
  });

  it('every promise of a free trial says 14 days', () => {
    const texts = [
      pricingCta.note,
      pricingPage.description,
      ...pricingPage.faq.map((item) => item.a),
    ];
    expect(texts.join(' ')).not.toMatch(/30 de zile (gratuite|cu tot)/);
    expect(pricingCta.note).toBe('La lansare: 14 zile gratuite, fără card.');
    expect(trialDays).toBe(appTrialDays);
  });

  it("the landing page's answer names both starting prices", () => {
    const answer = faq.items.find((item) => item.q === 'Cât costă?')?.a;
    expect(answer).toContain(`Start de la ${eur(start.firstPrice)}`);
    expect(answer).toContain(`Profesional de la ${eur(profesional.firstPrice)}`);
  });
});
