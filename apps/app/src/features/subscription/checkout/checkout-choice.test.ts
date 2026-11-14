import { describe, expect, it } from 'vitest';

import { nextStepAction, nextStepOf, nextStepSentence } from './checkout-choice';

describe('the step past today’s employees', () => {
  it("is the plan's own next step, named by its own employees", () => {
    const choice = { plan: 'profesional', step: 500, interval: 'month' } as const;
    const next = nextStepOf(choice, 600)!;
    expect(next).toMatchObject({ plan: 'profesional', step: { employees: 1000 } });
    expect(nextStepSentence(choice, next)).toBe(
      'Treapta de 1.000 de lucrători costă 119 € + TVA pe lună.'
    );
    expect(nextStepAction(choice, next)).toEqual({
      label: 'Treci pe treapta următoare',
      search: { plan: 'profesional', step: 1000 },
    });
  });

  it("goes on to Profesional past Start's last step", () => {
    const choice = { plan: 'start', step: 750, interval: 'year' } as const;
    const next = nextStepOf(choice, 800)!;
    expect(nextStepSentence(choice, next)).toBe(
      'Profesional, cu treapta de 1.000 de lucrători, costă 1.188 € + TVA pe an.'
    );
    expect(nextStepAction(choice, next)).toEqual({
      label: 'Treci pe Profesional',
      search: { plan: 'profesional', step: 1000 },
    });
  });

  it('is none past 5,000, which is an offer', () => {
    expect(nextStepOf({ plan: 'profesional', step: 5000, interval: 'month' }, 5001)).toBeNull();
  });
});
