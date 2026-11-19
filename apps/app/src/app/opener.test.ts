import type { ParsedLocation } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { keepOpener, openedFromRecord, openedFromSection, openedHere } from './opener';

const at = (state: Partial<ParsedLocation['state']>) =>
  ({ __TSR_index: 4, ...state }) as ParsedLocation['state'];

describe('the sidebar section in the opener state', () => {
  it('is set by the page that names it and kept by links that stay in the record', () => {
    const worker = openedFromSection('/angajati')(at({}));
    expect(worker).toEqual({ opener: 4, section: '/angajati' });
    expect(keepOpener(at(worker))).toEqual({ opener: 4, section: '/angajati' });
    expect(openedFromRecord('/clienti/1/angajati/2')(at(worker))).toEqual({
      opener: 4,
      openerRecord: '/clienti/1/angajati/2',
      section: '/angajati',
    });
  });

  it('is dropped by a page the record opens, which belongs to the client again', () => {
    expect(openedHere(at({ opener: 1, section: '/angajati' }))).toEqual({ opener: 4 });
  });

  it('is kept by links inside the record even without an opener', () => {
    expect(keepOpener(at({ section: '/angajati' }))).toEqual({ section: '/angajati' });
    expect(keepOpener(at({}))).toEqual({});
  });
});
