import { describe, expect, it } from 'vitest';

import { normalizePhone, phoneSchema } from './phone';

describe('phone', () => {
  it('reads a Romanian number however it is written', () => {
    expect(normalizePhone('0721 000 000')).toBe('+40721000000');
    expect(normalizePhone('0721.000.000')).toBe('+40721000000');
    expect(normalizePhone('(021) 312-3456')).toBe('+40213123456');
    expect(normalizePhone('0040 721 000 000')).toBe('+40721000000');
    expect(normalizePhone('+40 721 000 000')).toBe('+40721000000');
    expect(normalizePhone('+40 (0) 721 000 000')).toBe('+40721000000');
  });

  it('keeps the country of a number written with + or 00', () => {
    expect(normalizePhone('+49 30 1234567')).toBe('+49301234567');
    expect(normalizePhone('00373 69 123 456')).toBe('+37369123456');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('refuses what cannot be a number', () => {
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('721 000 000')).toBeNull();
    expect(normalizePhone('0721 000 00')).toBeNull();
    expect(normalizePhone('+40 721 000 0000')).toBeNull();
    expect(normalizePhone('+0721000000')).toBeNull();
    expect(normalizePhone('+1234')).toBeNull();
    expect(normalizePhone('07210000001234567')).toBeNull();
    expect(normalizePhone('0721/000/000')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('parses to E.164 and reports an unreadable number', () => {
    expect(phoneSchema.parse(' 0721 000 000 ')).toBe('+40721000000');
    expect(phoneSchema.safeParse('call me').error?.issues[0]?.message).toBe(
      'Invalid phone number.'
    );
  });
});
