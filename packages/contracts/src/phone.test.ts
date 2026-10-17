import { describe, expect, it } from 'vitest';

import { countryOf, normalizePhone, phoneSchema } from './phone';

describe('phone', () => {
  it('reads a Romanian number however it is written', () => {
    expect(normalizePhone('0721 000 000')).toBe('+40721000000');
    expect(normalizePhone('0721.000.000')).toBe('+40721000000');
    expect(normalizePhone('(021) 312-3456')).toBe('+40213123456');
    expect(normalizePhone('0040 721 000 000')).toBe('+40721000000');
    expect(normalizePhone('+40 721 000 000')).toBe('+40721000000');
    expect(normalizePhone('+40 (0) 721 000 000')).toBe('+40721000000');
    expect(normalizePhone('+400721000000')).toBe('+40721000000');
  });

  it('reads a Romanian number written without its trunk zero', () => {
    expect(normalizePhone('721 000 000')).toBe('+40721000000');
  });

  it('accepts a landline as well as a mobile', () => {
    expect(normalizePhone('021 312 3456')).toBe('+40213123456');
    expect(normalizePhone('+39 06 1234 5678')).toBe('+390612345678');
  });

  it('keeps the country of a number written with + or 00', () => {
    expect(normalizePhone('+49 30 1234567')).toBe('+49301234567');
    expect(normalizePhone('00373 69 123 456')).toBe('+37369123456');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('reads the numbers of foreign workers', () => {
    expect(normalizePhone('+373 69 123 456')).toBe('+37369123456');
    expect(normalizePhone('+380 67 123 4567')).toBe('+380671234567');
    expect(normalizePhone('+977 984 1234567')).toBe('+9779841234567');
    expect(normalizePhone('+39 333 123 4567')).toBe('+393331234567');
    expect(normalizePhone('+44 7400 123456')).toBe('+447400123456');
  });

  it('reads a national number in the country it is given', () => {
    expect(normalizePhone('069 123 456', 'MD')).toBe('+37369123456');
    expect(normalizePhone('333 123 4567', 'IT')).toBe('+393331234567');
    expect(normalizePhone('07400 123456', 'GB')).toBe('+447400123456');
    expect(normalizePhone('+40 721 000 000', 'IT')).toBe('+40721000000');
  });

  it('refuses what cannot be a number', () => {
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('0721 000 00')).toBeNull();
    expect(normalizePhone('+40 721 000 0000')).toBeNull();
    expect(normalizePhone('+40 21 3')).toBeNull();
    expect(normalizePhone('+0721000000')).toBeNull();
    expect(normalizePhone('+1234')).toBeNull();
    expect(normalizePhone('07210000001234567')).toBeNull();
    expect(normalizePhone('+380 67 123')).toBeNull();
    expect(normalizePhone('+39 333')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('refuses a number inside other text', () => {
    expect(normalizePhone('0721/000/000')).toBeNull();
    expect(normalizePhone('tel 0721000000')).toBeNull();
    expect(normalizePhone('0721000000 ext 5')).toBeNull();
  });

  it('names the country of a stored number', () => {
    expect(countryOf('+40721000000')).toBe('RO');
    expect(countryOf('+37369123456')).toBe('MD');
    expect(countryOf('+447400123456')).toBe('GB');
    expect(countryOf('+40721')).toBeNull();
    expect(countryOf('')).toBeNull();
  });

  it('parses to E.164 and reports an unreadable number', () => {
    expect(phoneSchema.parse(' 0721 000 000 ')).toBe('+40721000000');
    expect(phoneSchema.parse('+977 984 1234567')).toBe('+9779841234567');
    expect(phoneSchema.safeParse('call me').error?.issues[0]?.message).toBe(
      'Invalid phone number.'
    );
  });
});
