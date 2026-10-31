import { describe, expect, it } from 'vitest';

import { smsUsage } from '@/test/billing-fixture';

import { codesLabel, smsBarFor, smsMeterFor, trialSmsNote } from './sms-copy';
import { roDate } from './subscription-copy';

const owner = { owner: true, stop: 'billed' } as const;
const member = { owner: false, stop: 'billed' } as const;

describe('codesLabel', () => {
  it('counts codes the Romanian way', () => {
    expect(codesLabel(1)).toBe('1 cod');
    expect(codesLabel(12)).toBe('12 coduri');
    expect(codesLabel(300)).toBe('300 de coduri');
    expect(codesLabel(1200)).toBe('1.200 de coduri');
  });
});

describe('the SMS meter', () => {
  it('says only signing codes count, and the price past the allowance to the owner alone', () => {
    const sms = smsUsage({ used: 142 });
    const forOwner = smsMeterFor(sms, owner);
    expect(forOwner).toMatchObject({ value: '142 din 300', tone: 'normal', raiseCap: false });
    expect(forOwner.hint).toContain('Se numără doar codurile de semnare');
    expect(forOwner.hint).toContain(
      `fiecare cod costă 0,10 € și apare pe factura din ${roDate(sms.periodEnd!)}`
    );
    expect(smsMeterFor(sms, member).hint).not.toContain('€');
  });

  it('turns amber from 80 %, with what is left until the renewal', () => {
    const meter = smsMeterFor(smsUsage({ used: 252, state: 'near' }), owner);
    expect(meter.tone).toBe('warning');
    expect(meter.hint).toMatch(/^Mai ai 48 incluse până pe \d\d\.\d\d\.\d{4}\./);
    expect(meter.hint).toContain('până la 900 de coduri pe lună');
  });

  it('shows the owner the codes past the allowance and their price; a member, no amounts', () => {
    const sms = smsUsage({ used: 342, overage: 42, state: 'over' });
    expect(smsMeterFor(sms, owner)).toMatchObject({ value: '342 din 300', tone: 'over' });
    expect(smsMeterFor(sms, owner).hint).toMatch(
      /^\+42 peste cele incluse, 0,10 € fiecare, pe factura din \d\d\.\d\d\.\d{4}\./
    );
    const forMember = smsMeterFor(sms, member).hint;
    expect(forMember).toBe(
      '+42 peste cele incluse. Codurile se trimit mai departe, până la 900 de coduri pe lună.'
    );
  });

  it('turns red at the safety cap, and offers the owner to raise it', () => {
    const sms = smsUsage({ used: 900, overage: 600, state: 'capped' });
    const forOwner = smsMeterFor(sms, owner);
    expect(forOwner).toMatchObject({ tone: 'danger', raiseCap: true });
    expect(forOwner.hint).toContain('Ai atins limita de siguranță, de 900 de coduri pe lună.');
    expect(forOwner.hint).toContain(
      'codurile pleacă pe email, iar cine nu are email nu poate semna'
    );
    expect(forOwner.hint).toContain('Cele 600 peste plan: 60 € + TVA');
    const forMember = smsMeterFor(sms, member);
    expect(forMember.raiseCap).toBe(false);
    expect(forMember.hint).toContain('Administratorul poate ridica limita.');
    expect(forMember.hint).not.toContain('€');
  });

  it('stops hard for a tester and before the first payment, with no price past it', () => {
    const tester = smsUsage({ used: 300, cap: null, capFactor: null, state: 'stopped' });
    const forTester = smsMeterFor(tester, { owner: true, stop: 'tester' });
    expect(forTester.tone).toBe('danger');
    expect(forTester.hint).toMatch(/^Cont de test: ai folosit cele 300 din luna aceasta\./);
    expect(forTester.hint).toContain('Scrie-ne la contact@ssmusor.ro');

    const chosen = smsUsage({
      used: 50,
      included: 50,
      allowance: 50,
      cap: null,
      capFactor: null,
      state: 'stopped',
    });
    const forOwner = smsMeterFor(chosen, { owner: true, stop: 'firstPayment' });
    expect(forOwner.hint).toMatch(/^Ai folosit cele 50 de până la prima plată\./);
    expect(forOwner.hint).toContain('După prima plată, cele în plus costă 0,10 € fiecare.');
    expect(smsMeterFor(chosen, { owner: false, stop: 'firstPayment' }).hint).not.toContain('€');

    expect(
      smsMeterFor({ ...chosen, used: 4, state: 'ok' }, { owner: true, stop: 'firstPayment' }).hint
    ).toBe(
      'Până la prima plată, codurile se opresc la 50; după ea, cele în plus costă 0,10 € fiecare.'
    );
  });

  it('draws no bar during a trial without SMS, nor where nothing limits them', () => {
    expect(smsMeterFor(smsUsage({ state: 'none', included: 0 }), owner)).toMatchObject({
      used: null,
      value: null,
      hint: trialSmsNote,
    });
    expect(
      smsMeterFor(smsUsage({ used: 12, included: null, allowance: null, cap: null }), owner)
    ).toMatchObject({
      used: null,
      value: '12',
      hint: 'Fără limită. Se numără doar codurile de semnare.',
    });
  });
});

describe('the SMS bar', () => {
  const reader = { ...owner, canAct: true };

  it('shows from 80 % only, closable at first', () => {
    expect(smsBarFor(smsUsage({ used: 200 }), reader)).toBeNull();
    expect(smsBarFor(smsUsage({ state: 'none' }), reader)).toBeNull();
    const near = smsBarFor(smsUsage({ used: 252, state: 'near' }), reader)!;
    expect(near).toMatchObject({ kind: 'sms', closable: true, link: 'usage' });
    expect(near.lead).toBe('Ai folosit 252 din cele 300 de coduri de semnare prin SMS.');
    expect(near.short).toBe('252 din 300 de coduri SMS.');
    expect(near.detail).toMatch(
      /^Se reînnoiesc pe \d\d\.\d\d\. Peste 300, fiecare cod costă 0,10 €\.$/
    );
    expect(
      smsBarFor(smsUsage({ used: 252, state: 'near' }), { ...member, canAct: false })!.detail
    ).toMatch(/^Se reînnoiesc pe \d\d\.\d\d\.$/);
  });

  it('stays past what is included, until the renewal', () => {
    const over = smsBarFor(smsUsage({ used: 342, state: 'over' }), reader)!;
    expect(over).toMatchObject({ kind: 'sms', closable: false });
    expect(over.lead).toBe('Ai trecut de cele 300 de coduri SMS incluse.');
  });

  it('turns red at the cap, with the owner raising it and a member told who can', () => {
    const capped = smsUsage({ used: 900, state: 'capped' });
    expect(smsBarFor(capped, reader)).toMatchObject({
      kind: 'smsStop',
      link: 'raiseCap',
      closable: false,
    });
    const forMember = smsBarFor(capped, { ...member, canAct: false })!;
    expect(forMember.link).toBeNull();
    expect(forMember.detail).toContain('administratorul poate ridica limita');
    expect(smsBarFor(capped, { ...owner, canAct: false })!.link).toBe('usage');
  });

  it('turns red at a hard stop too', () => {
    const stopped = smsUsage({ used: 300, cap: null, capFactor: null, state: 'stopped' });
    const bar = smsBarFor(stopped, { owner: true, stop: 'tester', canAct: true })!;
    expect(bar).toMatchObject({ kind: 'smsStop', closable: false, link: 'usage' });
    expect(bar.detail).toMatch(/^Ai folosit cele 300 de coduri ale lunii\./);
  });
});
